const amqp = require('amqplib');
const Minio = require('minio');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
    RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
    MINIO_PORT: parseInt(process.env.MINIO_PORT) || 9000,
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123',
    HLS_OUTPUT_DIR: process.env.HLS_OUTPUT_DIR || './hls_output',
    QUEUE_NAME: 'stream_events',
    BUCKET_NAME: 'streams'
};

// MinIO client
const minioClient = new Minio.Client({
    endPoint: CONFIG.MINIO_ENDPOINT,
    port: CONFIG.MINIO_PORT,
    useSSL: false,
    accessKey: CONFIG.MINIO_ACCESS_KEY,
    secretKey: CONFIG.MINIO_SECRET_KEY
});

// Active stream watchers
const streamWatchers = new Map();

// Initialize MinIO bucket
async function initMinio() {
    let retries = 5;
    while (retries > 0) {
        try {
            const exists = await minioClient.bucketExists(CONFIG.BUCKET_NAME);
            if (!exists) {
                await minioClient.makeBucket(CONFIG.BUCKET_NAME, 'us-east-1');
                console.log(`✅ Created MinIO bucket: ${CONFIG.BUCKET_NAME}`);
                
                // Set bucket policy for public read access
                const policy = {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${CONFIG.BUCKET_NAME}/*`]
                    }]
                };
                await minioClient.setBucketPolicy(CONFIG.BUCKET_NAME, JSON.stringify(policy));
                console.log('✅ Set bucket policy for public access');
            } else {
                console.log(`✅ MinIO bucket exists: ${CONFIG.BUCKET_NAME}`);
            }
            return;
        } catch (error) {
            console.error(`Failed to initialize MinIO, retries left: ${retries - 1}`, error.message);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.error('Could not initialize MinIO after multiple retries');
}

// Upload file to MinIO
async function uploadToMinio(localPath, streamKey) {
    const fileName = path.basename(localPath);
    const objectName = `${streamKey}/${fileName}`;
    
    try {
        // Determine content type
        let contentType = 'application/octet-stream';
        if (fileName.endsWith('.m3u8')) {
            contentType = 'application/vnd.apple.mpegurl';
        } else if (fileName.endsWith('.ts')) {
            contentType = 'video/MP2T';
        }
        
        await minioClient.fPutObject(CONFIG.BUCKET_NAME, objectName, localPath, {
            'Content-Type': contentType
        });
        
        console.log(`📤 Uploaded to MinIO: ${objectName}`);
        return `http://${CONFIG.MINIO_ENDPOINT}:${CONFIG.MINIO_PORT}/${CONFIG.BUCKET_NAME}/${objectName}`;
    } catch (error) {
        console.error(`Failed to upload ${fileName} to MinIO:`, error.message);
        return null;
    }
}

// Watch stream directory for new files
function watchStreamDirectory(streamKey) {
    const streamDir = path.join(CONFIG.HLS_OUTPUT_DIR, streamKey);
    
    // Ensure directory exists
    if (!fs.existsSync(streamDir)) {
        fs.mkdirSync(streamDir, { recursive: true });
    }
    
    console.log(`👁️ Watching directory: ${streamDir}`);
    
    const watcher = chokidar.watch(streamDir, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });
    
    watcher.on('add', async (filePath) => {
        const fileName = path.basename(filePath);
        if (fileName.endsWith('.ts') || fileName.endsWith('.m3u8')) {
            console.log(`📁 New file detected: ${fileName}`);
            await uploadToMinio(filePath, streamKey);
        }
    });
    
    watcher.on('change', async (filePath) => {
        const fileName = path.basename(filePath);
        if (fileName.endsWith('.m3u8')) {
            console.log(`🔄 Playlist updated: ${fileName}`);
            await uploadToMinio(filePath, streamKey);
        }
    });
    
    watcher.on('error', (error) => {
        console.error(`Watcher error for ${streamKey}:`, error);
    });
    
    streamWatchers.set(streamKey, watcher);
    return watcher;
}

// Stop watching stream directory
async function stopWatchingStream(streamKey) {
    const watcher = streamWatchers.get(streamKey);
    if (watcher) {
        await watcher.close();
        streamWatchers.delete(streamKey);
        console.log(`🛑 Stopped watching stream: ${streamKey}`);
    }
}

// Process stream events from RabbitMQ
async function processEvent(message) {
    const event = JSON.parse(message.content.toString());
    console.log(`📥 Received event: ${event.eventType}`, event);
    
    switch (event.eventType) {
        case 'STREAM_STARTED':
            console.log(`🎬 Processing STREAM_STARTED for: ${event.streamKey}`);
            watchStreamDirectory(event.streamKey);
            break;
            
        case 'STREAM_ENDED':
            console.log(`🛑 Processing STREAM_ENDED for: ${event.streamKey}`);
            // Wait a bit for final files to be written
            setTimeout(async () => {
                await stopWatchingStream(event.streamKey);
            }, 5000);
            break;
            
        default:
            console.log(`Unknown event type: ${event.eventType}`);
    }
}

// Connect to RabbitMQ and consume messages
async function startConsumer() {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Connecting to RabbitMQ...');
            const connection = await amqp.connect(CONFIG.RABBITMQ_URL);
            const channel = await connection.createChannel();
            
            await channel.assertQueue(CONFIG.QUEUE_NAME, { durable: true });
            
            // Only process one message at a time
            channel.prefetch(1);
            
            console.log(`✅ Connected to RabbitMQ, consuming from: ${CONFIG.QUEUE_NAME}`);
            
            channel.consume(CONFIG.QUEUE_NAME, async (message) => {
                if (message) {
                    try {
                        await processEvent(message);
                        channel.ack(message);
                    } catch (error) {
                        console.error('Error processing message:', error);
                        // Requeue the message
                        channel.nack(message, false, true);
                    }
                }
            });
            
            // Handle connection close
            connection.on('close', () => {
                console.error('RabbitMQ connection closed, reconnecting...');
                setTimeout(startConsumer, 5000);
            });
            
            return;
        } catch (error) {
            console.error(`Failed to connect to RabbitMQ, retries left: ${retries - 1}`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.error('Could not connect to RabbitMQ after multiple retries');
}

// Cleanup function
async function cleanup() {
    console.log('🧹 Cleaning up...');
    for (const [streamKey, watcher] of streamWatchers) {
        await watcher.close();
        console.log(`Closed watcher for: ${streamKey}`);
    }
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Main entry point
async function main() {
    console.log('🚀 Transcoding Worker starting...');
    
    // Ensure HLS output directory exists
    if (!fs.existsSync(CONFIG.HLS_OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.HLS_OUTPUT_DIR, { recursive: true });
    }
    
    // Initialize services
    await initMinio();
    await startConsumer();
    
    console.log('✅ Transcoding Worker is running');
    console.log(`📁 Watching HLS output at: ${CONFIG.HLS_OUTPUT_DIR}`);
}

main().catch(console.error);
