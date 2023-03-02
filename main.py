from fastapi import FastAPI, WebSocket
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate
from aiortc.contrib.media import MediaBlackhole, MediaPlayer, MediaRecorder
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

connections = {}
peer_connections = {}


@app.websocket("/ws/{room_name}")
async def websocket_endpoint(websocket: WebSocket, room_name: str):
    if room_name not in connections:
        connections[room_name] = []
        peer_connections[room_name] = {}
    connections[room_name].append(websocket)

    try:
        await websocket.accept()
        async for message in websocket.iter_text():
            if message.startswith('OFFER'):
                pc = RTCPeerConnection()
                peer_connections[room_name][websocket] = pc

                recorder = MediaBlackhole()
                player = MediaPlayer('output.wav')
                pc.addTrack(player.audio)
                pc.addTrack(recorder.audio)

                offer = RTCSessionDescription(sdp=message, type='offer')
                await pc.setRemoteDescription(offer)

                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await websocket.send_text(answer.sdp)
            elif message.startswith('ANSWER'):
                pc = peer_connections[room_name][websocket]
                answer = RTCSessionDescription(sdp=message, type='answer')
                await pc.setRemoteDescription(answer)
            elif message.startswith('CANDIDATE'):
                pc = peer_connections[room_name][websocket]
                candidate = RTCIceCandidate.from_sdp(message)
                await pc.addIceCandidate(candidate)

            for conn in connections[room_name]:
                if conn != websocket:
                    await conn.send_text(message)
    finally:
        connections[room_name].remove(websocket)
        if room_name in peer_connections and websocket in peer_connections.get(room_name, {}):
            del peer_connections[room_name][websocket]


@app.get("/")
async def index():
    with open("static/index.html") as f:
        return HTMLResponse(f.read())


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, access_log=False)
