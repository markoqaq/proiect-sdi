const express = require('express');
const cors = require('cors');
const amqp = require('amqplib');
const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 8080,
    RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
    MINIO_PORT: parseInt(process.env.MINIO_PORT) || 9000,
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123',
    BUCKET_NAME: 'streams',
    QUEUE_NAME: 'stream_events'
};

// In-memory store for active streams
const activeStreams = new Map();

// MinIO client
const minioClient = new Minio.Client({
    endPoint: CONFIG.MINIO_ENDPOINT,
    port: CONFIG.MINIO_PORT,
    useSSL: false,
    accessKey: CONFIG.MINIO_ACCESS_KEY,
    secretKey: CONFIG.MINIO_SECRET_KEY
});

// RabbitMQ connection
let rabbitChannel = null;

async function connectRabbitMQ() {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Connecting to RabbitMQ...');
            const connection = await amqp.connect(CONFIG.RABBITMQ_URL);
            rabbitChannel = await connection.createChannel();
            
            // Use fanout exchange so all consumers get all messages
            const exchangeName = 'stream_events_fanout';
            await rabbitChannel.assertExchange(exchangeName, 'fanout', { durable: true });
            
            // Create exclusive queue for this service
            const q = await rabbitChannel.assertQueue('', { exclusive: true });
            await rabbitChannel.bindQueue(q.queue, exchangeName, '');
            
            // Consume events to track streams
            rabbitChannel.consume(q.queue, (message) => {
                if (message) {
                    try {
                        const event = JSON.parse(message.content.toString());
                        handleStreamEvent(event);
                    } catch (error) {
                        console.error('Error processing message:', error);
                    }
                    rabbitChannel.ack(message);
                }
            });
            
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

function handleStreamEvent(event) {
    console.log('📥 Stream event:', event.eventType);
    
    switch (event.eventType) {
        case 'STREAM_STARTED':
            activeStreams.set(event.streamKey, {
                streamKey: event.streamKey,
                title: event.title || 'Live Stream',
                playlistUrl: event.playlistUrl,
                startedAt: event.timestamp,
                viewers: 0
            });
            console.log(`✅ Stream registered: ${event.streamKey}`);
            break;
            
        case 'STREAM_ENDED':
            activeStreams.delete(event.streamKey);
            console.log(`🛑 Stream removed: ${event.streamKey}`);
            break;
    }
}

// API Routes

// Get all active streams
app.get('/api/streams', (req, res) => {
    const streams = Array.from(activeStreams.values());
    res.json({ streams, count: streams.length });
});

// Get specific stream info
app.get('/api/streams/:streamKey', (req, res) => {
    const stream = activeStreams.get(req.params.streamKey);
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    res.json(stream);
});

// Get stream playlist URL (for viewers)
app.get('/api/streams/:streamKey/watch', async (req, res) => {
    const { streamKey } = req.params;
    const stream = activeStreams.get(streamKey);
    
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    
    // Increment viewer count
    stream.viewers = (stream.viewers || 0) + 1;
    
    res.json({
        streamKey: stream.streamKey,
        title: stream.title,
        playlistUrl: `/hls/${streamKey}/playlist.m3u8`,
        minioUrl: `http://${CONFIG.MINIO_ENDPOINT}:${CONFIG.MINIO_PORT}/${CONFIG.BUCKET_NAME}/${streamKey}/playlist.m3u8`
    });
});

// Decrease viewer count when leaving
app.post('/api/streams/:streamKey/leave', (req, res) => {
    const stream = activeStreams.get(req.params.streamKey);
    if (stream && stream.viewers > 0) {
        stream.viewers--;
    }
    res.json({ success: true });
});

// Authentication endpoint (for RTMP on_publish callback)
app.post('/api/on_publish', (req, res) => {
    console.log('📡 Publish request:', req.body);
    // Simple authentication - always allow for demo
    // In production, validate stream key against database
    res.status(200).send('OK');
});

// Create a new stream (generate stream key)
app.post('/api/streams/create', (req, res) => {
    const streamKey = uuidv4();
    res.json({
        streamKey,
        rtmpUrl: `rtmp://localhost:1935/live/${streamKey}`,
        wsUrl: `ws://localhost:3000`,
        message: 'Use this stream key to start broadcasting'
    });
});

// List files in MinIO for a stream
app.get('/api/streams/:streamKey/files', async (req, res) => {
    try {
        const { streamKey } = req.params;
        const objects = [];
        
        const stream = minioClient.listObjects(CONFIG.BUCKET_NAME, `${streamKey}/`, true);
        
        stream.on('data', (obj) => {
            objects.push({
                name: obj.name,
                size: obj.size,
                lastModified: obj.lastModified
            });
        });
        
        stream.on('end', () => {
            res.json({ files: objects });
        });
        
        stream.on('error', (err) => {
            res.status(500).json({ error: err.message });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        activeStreams: activeStreams.size
    });
});

// System stats
app.get('/api/stats', (req, res) => {
    const totalViewers = Array.from(activeStreams.values())
        .reduce((sum, stream) => sum + (stream.viewers || 0), 0);
    
    res.json({
        activeStreams: activeStreams.size,
        totalViewers,
        uptime: process.uptime()
    });
});

// Start server
app.listen(CONFIG.PORT, () => {
    console.log(`🚀 API Service running on port ${CONFIG.PORT}`);
});

// Connect to RabbitMQ
connectRabbitMQ();

console.log('✅ API Service initialized');
