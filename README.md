# GameStream

**Platformă de Live Streaming pentru Jocuri** - Proiect Sisteme Distribuite

O aplicație web care permite utilizatorilor să transmită live gameplay-ul lor direct din browser către spectatori multipli, folosind arhitectură de microservicii.

---

## Descriere

GameStream este o platformă simplificată de streaming similar cu Twitch, construită pentru a demonstra concepte de sisteme distribuite:

- **Streamer-ul** partajează ecranul direct din browser
- **Video-ul** este procesat în timp real și convertit în format HLS
- **Spectatorii** pot viziona stream-ul de pe orice dispozitiv din rețea

---

## Tehnologii Folosite

### Backend
- **Node.js 18** - Runtime pentru toate serviciile
- **Express.js** - Framework REST API
- **WebSocket (ws)** - Comunicare real-time pentru streaming
- **FFmpeg** - Transcodare video WebM → HLS
- **amqplib** - Client RabbitMQ

### Infrastructure
- **Docker & Docker Compose** - Containerizare și orchestrare
- **RabbitMQ** - Message broker (fanout exchange)
- **MinIO** - Object storage compatibil S3
- **Nginx** - Reverse proxy și CDN

### Frontend
- **HTML5 / CSS3 / JavaScript**
- **Bootstrap 5** - UI framework
- **Video.js** - Player HLS
- **MediaRecorder API** - Captură video în browser

### Security
- **HTTPS / WSS** - Conexiuni securizate
- **OpenSSL** - Certificate SSL self-signed

---

## Arhitectura

```
Browser (Streamer)
       │
       │ WebSocket (video chunks)
       ▼
┌─────────────────┐
│  Ingest Service │ ──── FFmpeg ────> HLS Files (.m3u8, .ts)
│   (Node.js)     │                         │
└────────┬────────┘                         │
         │                                  │
         │ Publish event                    │
         ▼                                  ▼
┌─────────────────┐                 ┌───────────────┐
│    RabbitMQ     │                 │  Transcoding  │
│ (Fanout Exchange)                 │    Worker     │
└────────┬────────┘                 └───────┬───────┘
         │                                  │
         │ Consume                          │ Upload
         ▼                                  ▼
┌─────────────────┐                 ┌───────────────┐
│   API Service   │                 │     MinIO     │
│   (Express)     │                 │  (S3 Storage) │
└─────────────────┘                 └───────────────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │   Nginx CDN   │ ──> Browser (Viewer)
                                    │  + Frontend   │
                                    └───────────────┘
```

---

## Servicii

| Serviciu | Port | Descriere |
|----------|------|-----------|
| **CDN (Nginx)** | 8443 (HTTPS) | Frontend + HLS streaming |
| **Ingest Service** | 3000 (WSS) | Primește video stream |
| **API Service** | 4000 | REST API pentru stream-uri |
| **RabbitMQ** | 5672, 15672 | Message broker |
| **MinIO** | 9000, 9001 | Object storage |

---

## Instalare și Pornire

### Cerințe
- Docker Desktop instalat și pornit
- Git
- OpenSSL (pentru certificate)

### Pași

**1. Clonează repository-ul**
```bash
git clone https://github.com/markoqaq/proiect-sdi.git
cd proiect-sdi
```

**2. Află IP-ul local** (Windows PowerShell)
```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" }).IPAddress
```

**3. Generează certificate SSL** (înlocuiește `YOUR_IP`)
```powershell
New-Item -ItemType Directory -Force -Path ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/server.key -out ssl/server.crt -subj "/CN=localhost" -addext "subjectAltName=IP:YOUR_IP,DNS:localhost"
```

**4. Copiază certificatele în servicii**
```powershell
Copy-Item -Recurse -Force ssl cdn/
Copy-Item -Recurse -Force ssl ingest-service/
```

**5. Pornește serviciile**
```bash
docker-compose up --build -d
```

**6. Verifică că totul rulează**
```bash
docker-compose ps
```

---

## Utilizare

### Accesare
- **URL**: `https://YOUR_IP:8443`
- Acceptă certificatul self-signed în browser

### Pentru a transmite
1. Click pe **"Transmite Live"**
2. Setează titlul stream-ului
3. Click **"Începe Stream-ul"**
4. Selectează ecranul/fereastra de partajat
5. Stream-ul este live!

### Pentru a viziona
1. Accesează pagina principală
2. Vezi lista de stream-uri active
3. Click pe un stream pentru a-l viziona

---

## API Endpoints

```
GET  /api/streams          - Lista stream-uri active
GET  /api/streams/:key     - Detalii stream
GET  /health               - Health check
```

---

## Comenzi Utile

```bash
# Vezi loguri
docker-compose logs -f

# Restart servicii
docker-compose down && docker-compose up --build -d

# Verifică stream-uri
curl -k https://localhost:8443/api/streams
```

---

## Structura Proiectului

```
proiect-sdi/
├── docker-compose.yml
├── README.md
│
├── ingest-service/          # WebSocket + FFmpeg
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
│
├── transcoding-worker/      # File watcher + MinIO upload
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
│
├── api-service/             # REST API
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
│
└── cdn/                     # Nginx + Frontend
    ├── Dockerfile
    ├── nginx.conf
    └── public/index.html
```

---

## Concepte Sisteme Distribuite

- **Message Queue Pattern** - RabbitMQ pentru comunicare asincronă
- **Microservices** - Servicii independente și specializate
- **Horizontal Scaling** - Posibilitate de scalare a worker-ilor
- **Fault Tolerance** - Mesajele persistă în coadă la eșec
- **Service Discovery** - Docker DNS pentru comunicare între servicii

---

## Autor

Proiect academic pentru cursul de **Sisteme Distribuite**.
