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

---

## 🛠️ Tehnologii Utilizate

### Backend & Runtime
| Tehnologie | Versiune | Utilizare |
|------------|----------|-----------|
| **Node.js** | 18-alpine | Runtime JavaScript pentru toate serviciile |
| **Express.js** | ^4.18.2 | Framework REST API pentru api-service |
| **WebSocket (ws)** | ^8.14.2 | Comunicare bidirecțională real-time pentru streaming |
| **amqplib** | ^0.10.3 | Client RabbitMQ pentru Node.js |
| **minio** | ^7.1.3 | Client S3 pentru upload fișiere în MinIO |
| **chokidar** | ^3.5.3 | Watcher pentru monitorizare fișiere HLS |
| **cors** | ^2.8.5 | Middleware CORS pentru Express |

### Video Processing
| Tehnologie | Utilizare |
|------------|-----------|
| **FFmpeg** | Transcodare video WebM → HLS |
| **HLS (HTTP Live Streaming)** | Protocol de streaming adaptiv |
| **MediaRecorder API** | Captură video în browser |
| **getDisplayMedia API** | Screen sharing în browser |
| **Video.js** | Player HLS în browser |

### Infrastructure & DevOps
| Tehnologie | Versiune | Utilizare |
|------------|----------|-----------|
| **Docker** | Latest | Containerizare servicii |
| **Docker Compose** | Latest | Orchestrare multi-container |
| **Nginx** | Alpine | Reverse proxy, CDN, HTTPS termination |
| **RabbitMQ** | 3-management | Message broker cu management UI |
| **MinIO** | Latest | Object storage compatibil S3 |

### Frontend
| Tehnologie | Versiune | Utilizare |
|------------|----------|-----------|
| **HTML5/CSS3/JavaScript** | ES6+ | Interfață utilizator |
| **Bootstrap** | 5.3.2 | Framework CSS responsive |
| **Video.js** | 8.6.1 | Player video HLS |
| **Inter Font** | Google Fonts | Tipografie modernă |

### Security
| Tehnologie | Utilizare |
|------------|-----------|
| **OpenSSL** | Generare certificate SSL self-signed |
| **HTTPS/WSS** | Conexiuni securizate (necesar pentru getDisplayMedia) |

---

## 📝 Procesul de Dezvoltare

### Faza 1: Arhitectura și Design
1. Definirea cerințelor: streaming live de pe browser către spectatori multipli
2. Alegerea arhitecturii microservicii pentru scalabilitate
3. Selectarea tehnologiilor potrivite pentru fiecare componentă

### Faza 2: Implementare Servicii

#### Ingest Service (WebSocket + FFmpeg)
```javascript
// Primește chunks video prin WebSocket
// Pipe-ează datele către FFmpeg pentru conversie
// FFmpeg generează segmente HLS (.ts) și playlist (.m3u8)
// Publică evenimente pe RabbitMQ fanout exchange
```

#### Transcoding Worker
```javascript
// Ascultă directorul HLS cu chokidar
// Detectează fișiere noi (.ts, .m3u8)
// Upload automat către MinIO S3
// Consumă mesaje din RabbitMQ
```

#### API Service
```javascript
// REST API cu Express.js
// Menține lista stream-urilor active
// Consumă evenimente de la RabbitMQ (exclusive queue)
// Endpoint-uri pentru listare și management
```

#### CDN (Nginx)
```nginx
# Servește frontend static
# Proxy pentru API (/api/)
# Servește fișiere HLS cu CORS headers
# HTTPS termination cu certificate SSL
```

### Faza 3: Integrare și Networking
1. Docker Compose pentru orchestrare
2. Network intern Docker pentru comunicare servicii
3. Binding pe 0.0.0.0 pentru acces din rețea
4. HTTPS cu certificate self-signed pentru getDisplayMedia

### Faza 4: RabbitMQ Architecture
```
Initial: Queue simplă → Problemă: doar un consumer primea mesajele

Soluție: Fanout Exchange
┌─────────────────────────────────────────────────────┐
│            stream_events_fanout (exchange)          │
│                    (fanout type)                    │
└─────────────────┬──────────────────┬────────────────┘
                  │                  │
                  ▼                  ▼
        ┌─────────────────┐  ┌─────────────────┐
        │ api_events_xxx  │  │ worker_events   │
        │ (exclusive)     │  │ (durable)       │
        └────────┬────────┘  └────────┬────────┘
                 │                    │
                 ▼                    ▼
          API Service          Transcoding Worker
```

### Faza 5: Frontend Modern
- Design dark theme cu gradient violet/cyan
- Text alb pe fundal închis pentru vizibilitate
- Responsive pentru mobile viewers
- Consolă pentru debugging în browser
- Statistici live (durată, bitrate, bytes)

---

## 🖥️ Setup pe Alt Computer

### Cerințe
- Docker Desktop instalat și pornit
- Git instalat
- Conexiune în aceeași rețea (pentru multi-device testing)

### Pași Rapizi

```powershell
# 1. Clonează repository-ul
git clone https://github.com/markoqaq/proiect-sdi.git
cd proiect-sdi

# 2. Află IP-ul local
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.PrefixOrigin -eq "Dhcp" }).IPAddress

# 3. Generează certificate SSL (înlocuiește YOUR_IP cu IP-ul de mai sus)
New-Item -ItemType Directory -Force -Path ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/server.key -out ssl/server.crt -subj "/CN=localhost" -addext "subjectAltName=IP:YOUR_IP,DNS:localhost"

# 4. Copiază certificatele
Copy-Item -Recurse -Force ssl cdn/
Copy-Item -Recurse -Force ssl ingest-service/

# 5. Pornește toate serviciile
docker-compose up --build -d

# 6. Verifică că totul rulează
docker-compose ps
```

### Accesare
- **Browser local**: https://localhost:8443 (acceptă certificatul)
- **Din rețea**: https://YOUR_IP:8443

### Troubleshooting
```powershell
# Vezi loguri
docker-compose logs -f

# Restart complet
docker-compose down
docker-compose up --build -d

# Verifică stream-uri active
curl -k https://localhost:8443/api/streams
```

---

## 📄 Licență

Proiect academic pentru cursul de Sisteme Distribuite.
 
 