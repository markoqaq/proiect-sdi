const WebSocket = require('ws');
const { spawn } = require('child_process');
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const CONFIG = {
    WS_PORT: 3000,
    RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
    HLS_OUTPUT_DIR: process.env.HLS_OUTPUT_DIR || './hls_output',
    QUEUE_NAME: 'stream_events',
    SSL_CERT: process.env.SSL_CERT || '/app/ssl/server.crt',
    SSL_KEY: process.env.SSL_KEY || '/app/ssl/server.key'
};

// Store active streams
const activeStreams = new Map();

// RabbitMQ connection
let rabbitChannel = null;
const EXCHANGE_NAME = 'stream_events_fanout';

async function connectRabbitMQ() {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Connecting to RabbitMQ...');
            const connection = await amqp.connect(CONFIG.RABBITMQ_URL);
            rabbitChannel = await connection.createChannel();
            
            // Create fanout exchange for broadcasting to all consumers
            await rabbitChannel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });
            // Also keep the queue for the transcoding worker
            await rabbitChannel.assertQueue(CONFIG.QUEUE_NAME, { durable: true });
            await rabbitChannel.bindQueue(CONFIG.QUEUE_NAME, EXCHANGE_NAME, '');
            
            console.log('✅ Connected to RabbitMQ');
            return;
        } catch (error) {
            console.error(`Failed to connect to RabbitMQ, retries left: ${retries - 1}`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.error('Could not connect to RabbitMQ after multiple retries');
}

// Publish event to RabbitMQ
async function publishEvent(eventType, data) {
    if (!rabbitChannel) {
        console.warn('RabbitMQ not connected, event not published');
        return;
    }
    
    const message = {
        eventType,
        timestamp: new Date().toISOString(),
        ...data
    };
    
    // Publish to fanout exchange so all consumers receive it
    rabbitChannel.publish(
        EXCHANGE_NAME,
        '',
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
    
    console.log(`📤 Published event: ${eventType}`, data);
}

// Ensure output directory exists
function ensureOutputDir(streamKey) {
    const outputDir = path.join(CONFIG.HLS_OUTPUT_DIR, streamKey);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    return outputDir;
}

// Start FFmpeg process for a stream
function startFFmpeg(streamKey) {
    const outputDir = ensureOutputDir(streamKey);
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    
    console.log(`🎬 Starting FFmpeg for stream: ${streamKey}`);
    console.log(`📁 Output directory: ${outputDir}`);
    
    const ffmpegArgs = [
        '-i', 'pipe:0',                    // Input from stdin
        '-c:v', 'libx264',                 // Video codec
        '-preset', 'ultrafast',            // Fast encoding
        '-tune', 'zerolatency',            // Low latency
        '-c:a', 'aac',                     // Audio codec
        '-ar', '44100',                    // Audio sample rate
        '-b:a', '128k',                    // Audio bitrate
        '-f', 'hls',                       // Output format
        '-hls_time', '2',                  // Segment duration (seconds)
        '-hls_list_size', '10',            // Number of segments in playlist
        '-hls_flags', 'delete_segments+append_list', // Cleanup old segments
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        playlistPath
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`);
    });
    
    ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs progress info to stderr
        const message = data.toString();
        if (message.includes('frame=') || message.includes('fps=')) {
            // Progress info - log occasionally
            if (Math.random() < 0.01) {
                console.log(`📊 FFmpeg progress for ${streamKey}`);
            }
        } else if (message.includes('error') || message.includes('Error')) {
            console.error(`FFmpeg error: ${message}`);
        }
    });
    
    ffmpeg.on('close', (code) => {
        console.log(`🛑 FFmpeg process for ${streamKey} exited with code ${code}`);
        activeStreams.delete(streamKey);
    });
    
    ffmpeg.on('error', (err) => {
        console.error(`FFmpeg error for ${streamKey}:`, err);
    });
    
    return ffmpeg;
}

// HTTP API for stream info
app.get('/api/streams', (req, res) => {
    const streams = [];
    activeStreams.forEach((stream, key) => {
        streams.push({
            streamKey: key,
            startedAt: stream.startedAt,
            bytesReceived: stream.bytesReceived
        });
    });
    res.json({ streams });
});

app.get('/api/streams/:streamKey', (req, res) => {
    const stream = activeStreams.get(req.params.streamKey);
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    res.json({
        streamKey: req.params.streamKey,
        startedAt: stream.startedAt,
        bytesReceived: stream.bytesReceived,
        playlistUrl: `/hls/${req.params.streamKey}/playlist.m3u8`
    });
});

// Create WebSocket server with SSL support
let server;
let wss;

// Check if SSL certificates exist
if (fs.existsSync(CONFIG.SSL_CERT) && fs.existsSync(CONFIG.SSL_KEY)) {
    // HTTPS/WSS mode
    const sslOptions = {
        cert: fs.readFileSync(CONFIG.SSL_CERT),
        key: fs.readFileSync(CONFIG.SSL_KEY)
    };
    server = https.createServer(sslOptions);
    wss = new WebSocket.Server({ server });
    server.listen(CONFIG.WS_PORT, () => {
        console.log(`🔒 Secure WebSocket Server (WSS) running on port ${CONFIG.WS_PORT}`);
    });
} else {
    // HTTP/WS mode (fallback)
    console.log('⚠️ SSL certificates not found, running in insecure mode');
    wss = new WebSocket.Server({ port: CONFIG.WS_PORT });
    console.log(`🚀 WebSocket Server (WS) running on port ${CONFIG.WS_PORT}`);
}

console.log(`🚀 WebSocket Ingest Server starting on port ${CONFIG.WS_PORT}`);

wss.on('connection', (ws, req) => {
    console.log('📡 New WebSocket connection');
    
    let streamKey = null;
    let ffmpegProcess = null;
    let bytesReceived = 0;
    
    ws.on('message', async (message) => {
        // Handle control messages (JSON)
        if (typeof message === 'string' || (Buffer.isBuffer(message) && message.length < 1000)) {
            try {
                const messageStr = message.toString();
                if (messageStr.startsWith('{')) {
                    const data = JSON.parse(messageStr);
                    
                    if (data.type === 'start_stream') {
                        streamKey = data.streamKey || uuidv4();
                        console.log(`🎥 Starting stream with key: ${streamKey}`);
                        
                        // Start FFmpeg
                        ffmpegProcess = startFFmpeg(streamKey);
                        
                        // Store stream info
                        activeStreams.set(streamKey, {
                            ws,
                            ffmpeg: ffmpegProcess,
                            startedAt: new Date().toISOString(),
                            bytesReceived: 0
                        });
                        
                        // Notify via RabbitMQ
                        await publishEvent('STREAM_STARTED', {
                            streamKey,
                            playlistUrl: `/hls/${streamKey}/playlist.m3u8`
                        });
                        
                        // Confirm to client
                        ws.send(JSON.stringify({
                            type: 'stream_started',
                            streamKey,
                            playlistUrl: `/hls/${streamKey}/playlist.m3u8`
                        }));
                        
                        return;
                    }
                    
                    if (data.type === 'stop_stream') {
                        console.log(`🛑 Stopping stream: ${streamKey}`);
                        if (ffmpegProcess) {
                            ffmpegProcess.stdin.end();
                        }
                        return;
                    }
                }
            } catch (e) {
                // Not JSON, treat as binary data
            }
        }
        
        // Handle binary video data
        if (ffmpegProcess && ffmpegProcess.stdin.writable) {
            try {
                ffmpegProcess.stdin.write(message);
                bytesReceived += message.length;
                
                // Update stream stats
                const stream = activeStreams.get(streamKey);
                if (stream) {
                    stream.bytesReceived = bytesReceived;
                }
                
                // Log progress periodically
                if (bytesReceived % (1024 * 1024) < message.length) {
                    console.log(`📈 Stream ${streamKey}: ${(bytesReceived / (1024 * 1024)).toFixed(2)} MB received`);
                }
            } catch (error) {
                console.error('Error writing to FFmpeg:', error);
            }
        }
    });
    
    ws.on('close', async () => {
        console.log(`📴 WebSocket closed for stream: ${streamKey}`);
        
        if (ffmpegProcess) {
            ffmpegProcess.stdin.end();
        }
        
        if (streamKey) {
            await publishEvent('STREAM_ENDED', {
                streamKey,
                totalBytesReceived: bytesReceived
            });
            activeStreams.delete(streamKey);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (ffmpegProcess) {
            ffmpegProcess.stdin.end();
        }
    });
});

// Start HTTP server
const HTTP_PORT = 3001;
app.listen(HTTP_PORT, () => {
    console.log(`📡 HTTP API running on port ${HTTP_PORT}`);
});

// Connect to RabbitMQ
connectRabbitMQ();

console.log('✅ Ingest Service is running');
console.log(`📺 WebSocket endpoint: ws://localhost:${CONFIG.WS_PORT}`);
console.log(`🔗 HTTP API endpoint: http://localhost:${HTTP_PORT}`);
