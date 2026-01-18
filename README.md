# 🎮 GameStream - Platformă de Live Streaming pentru Jocuri

O platformă distribuită de streaming live construită cu arhitectură de microservicii.

## 📋 Cuprins

- [Arhitectura](#arhitectura)
- [Componente](#componente)
- [Pornire Rapidă](#pornire-rapidă)
- [Utilizare](#utilizare)
- [API Endpoints](#api-endpoints)
- [Configurare](#configurare)
- [Scalabilitate](#scalabilitate)

## 🏗️ Arhitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GAMESTREAM ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     WebSocket      ┌──────────────────┐                  │
│   │   Browser    │ ──────────────────>│  Ingest Service  │                  │
│   │  (Streamer)  │    Video Chunks    │    (Node.js)     │                  │
│   └──────────────┘                    └────────┬─────────┘                  │
│                                                │                            │
│                                                │ FFmpeg                     │
│                                                ▼                            │
│   ┌──────────────┐                    ┌──────────────────┐                  │
│   │  RabbitMQ    │<───────────────────│   HLS Files      │                  │
│   │ (Message Q)  │   Stream Events    │  (.m3u8, .ts)    │                  │
│   └──────┬───────┘                    └────────┬─────────┘                  │
│          │                                     │                            │
│          ▼                                     ▼                            │
│   ┌──────────────────┐               ┌──────────────────┐                   │
│   │ Transcoding      │──────────────>│     MinIO        │                   │
│   │ Worker           │   Upload      │  (S3 Storage)    │                   │
│   └──────────────────┘               └────────┬─────────┘                   │
│                                               │                             │
│                                               ▼                             │
│   ┌──────────────┐                   ┌──────────────────┐                   │
│   │   Browser    │<──────────────────│   Nginx CDN      │                   │
│   │  (Viewer)    │   HLS Stream      │   + Frontend     │                   │
│   └──────────────┘                   └──────────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fluxul de Date

1. **Streamer** capturează ecranul folosind `getDisplayMedia()` API
2. **MediaRecorder** comprimă video în format WebM
3. Datele sunt trimise prin **WebSocket** către Ingest Service
4. **FFmpeg** convertește stream-ul WebM în format **HLS** (HTTP Live Streaming)
5. Fișierele HLS sunt salvate local și sincronizate cu **MinIO** (S3)
6. **Spectatorii** primesc stream-ul prin **Nginx CDN**

## 🧩 Componente

| Serviciu | Tehnologie | Port | Descriere |
|----------|------------|------|-----------|
| **Ingest Service** | Node.js + WebSocket | 3000 | Primește stream-ul video de la browser |
| **Transcoding Worker** | Node.js + FFmpeg | - | Procesează și urcă fișierele HLS |
| **API Service** | Node.js + Express | 8080 | Gestionează stream-urile și utilizatorii |
| **CDN** | Nginx | 8081 | Servește frontend-ul și fișierele HLS |
| **RabbitMQ** | RabbitMQ 3 | 5672, 15672 | Message broker pentru comunicare asincronă |
| **MinIO** | MinIO | 9000, 9001 | Stocare distribuită compatibilă S3 |

## 🚀 Pornire Rapidă

### Cerințe
- Docker Desktop instalat
- Docker Compose
- Browser modern (Chrome, Firefox, Edge)

### Pornire

```bash
# Clonează repository-ul
cd Proiect-sdi

# Pornește toate serviciile
docker-compose up --build

# Sau în modul detached
docker-compose up -d --build
```

### Accesare

| Serviciu | URL |
|----------|-----|
| **Frontend** | http://localhost:8081 |
| **API** | http://localhost:8080 |
| **RabbitMQ Console** | http://localhost:15672 (admin/admin123) |
| **MinIO Console** | http://localhost:9001 (minioadmin/minioadmin123) |

## 📺 Utilizare

### Pentru Streamer

1. Accesează http://localhost:8081
2. Click pe **"Transmite Live"**
3. Setează titlul stream-ului
4. Click **"Începe Stream-ul"**
5. Permite partajarea ecranului în browser
6. Stream-ul este acum LIVE! 🔴

### Pentru Spectator

1. Accesează http://localhost:8081
2. Vezi lista de stream-uri active în pagina principală
3. Click pe un stream pentru a-l viziona
4. Player-ul HLS va porni automat

## 🔌 API Endpoints

### Streams

```http
GET  /api/streams              # Lista stream-uri active
GET  /api/streams/:key         # Detalii stream specific
GET  /api/streams/:key/watch   # URL pentru vizionare
POST /api/streams/create       # Generează cheie nouă de stream
POST /api/streams/:key/leave   # Notifică părăsirea stream-ului
```

### System

```http
GET  /health                   # Health check
GET  /api/stats                # Statistici sistem
```

### Exemple

```bash
# Lista stream-uri active
curl http://localhost:8080/api/streams

# Statistici sistem
curl http://localhost:8080/api/stats
```

## ⚙️ Configurare

### Variabile de Mediu

| Variabilă | Default | Descriere |
|-----------|---------|-----------|
| `RABBITMQ_URL` | `amqp://admin:admin123@rabbitmq:5672` | URL RabbitMQ |
| `MINIO_ENDPOINT` | `minio` | Host MinIO |
| `MINIO_PORT` | `9000` | Port MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Access key MinIO |
| `MINIO_SECRET_KEY` | `minioadmin123` | Secret key MinIO |

### Configurare FFmpeg

În `ingest-service/src/index.js`:

```javascript
const ffmpegArgs = [
    '-i', 'pipe:0',              // Input din stdin
    '-c:v', 'libx264',           // Codec video
    '-preset', 'ultrafast',      // Viteză encoding
    '-tune', 'zerolatency',      // Latență minimă
    '-f', 'hls',                 // Format output
    '-hls_time', '2',            // Durata segment (secunde)
    '-hls_list_size', '10',      // Segmente în playlist
];
```

## 📈 Scalabilitate

### Scalare Orizontală Worker-i

```bash
# Pornește 3 instanțe de transcoding worker
docker-compose up -d --scale transcoding-worker=3
```

### Avantaje Arhitectură Distribuită

1. **Decuplare** - Serviciile comunică asincron prin RabbitMQ
2. **Scalabilitate** - Adaugă mai mulți worker-i fără downtime
3. **Toleranță la erori** - Dacă un worker cade, mesajele rămân în coadă
4. **Izolare** - Fiecare serviciu poate fi updatat independent

### Diagrama de Scalare

```
                    ┌─────────────────────┐
                    │   Load Balancer     │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Ingest Pod 1   │  │  Ingest Pod 2   │  │  Ingest Pod 3   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │     RabbitMQ        │
                    │    (Clustered)      │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Worker Pod 1   │  │  Worker Pod 2   │  │  Worker Pod 3   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │  MinIO (Distributed)│
                    └─────────────────────┘
```

## 🔧 Debugging

### Logs

```bash
# Toate serviciile
docker-compose logs -f

# Serviciu specific
docker-compose logs -f ingest-service
docker-compose logs -f transcoding-worker
```

### Verificare Servicii

```bash
# Status containere
docker-compose ps

# Health check API
curl http://localhost:8080/health

# Vezi mesaje RabbitMQ
# Accesează http://localhost:15672 -> Queues -> stream_events
```

## 📁 Structura Proiectului

```
Proiect-sdi/
├── docker-compose.yml          # Orchestrare containere
├── README.md                   # Documentație
│
├── ingest-service/             # Serviciu primire stream
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js
│
├── transcoding-worker/         # Worker procesare video
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js
│
├── api-service/                # API REST
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js
│
└── cdn/                        # Frontend + CDN
    ├── Dockerfile
    ├── nginx.conf
    └── public/
        └── index.html
```

## 🎓 Concepte Sisteme Distribuite Demonstrate

1. **Message Queue Pattern** - RabbitMQ pentru comunicare asincronă
2. **Microservices Architecture** - Servicii independente și specializate
3. **Load Balancing** - Distribuția sarcinilor între worker-i
4. **Eventual Consistency** - Sincronizare asincronă cu MinIO
5. **Fault Tolerance** - Mesajele persistă în coadă la eșec
6. **Horizontal Scaling** - Adăugare dinamică de worker-i
7. **Service Discovery** - Docker Compose DNS pentru servicii

## 📄 Licență

Proiect academic pentru cursul de Sisteme Distribuite.
#   p r o i e c t - s d i  
 