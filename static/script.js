const room_id = "my-room";
const signaling_url = "ws://" + window.location.host + "/ws/" + room_id;
let pc;

const localVideo = document.querySelector("#local-video");
const remoteVideo = document.querySelector("#remote-video");
const startButton = document.querySelector("#start-button");
const callButton = document.querySelector("#call-button");
const hangupButton = document.querySelector("#hangup-button");

startButton.addEventListener("click", start);
callButton.addEventListener("click", call);
hangupButton.addEventListener("click", hangup);

async function start() {
  console.log("Requesting local stream");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  console.log("Received local stream");
  localVideo.srcObject = stream;
  return stream;
}

async function call() {
  console.log("Starting call");
  startButton.disabled = true;
  callButton.disabled = true;
  hangupButton.disabled = false;

  const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  pc = new RTCPeerConnection(configuration);

  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      console.log("Local ICE candidate:", event.candidate);
      sendToServer({ candidate: event.candidate });
    }
  });

  pc.addEventListener("track", (event) => {
    console.log("Received remote track:", event.streams[0]);
    remoteVideo.srcObject = event.streams[0];
  });

  const stream = await start();
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log("Local SDP:", offer.sdp);
  sendToServer({ description: offer });
}

function hangup() {
  console.log("Ending call");
  pc.close();
  pc = null;
  localVideo.srcObject.getTracks().forEach((track) => track.stop());
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  startButton.disabled = false;
  callButton.disabled = false;
  hangupButton.disabled = true;
  sendToServer({ hangup: true });
}

function sendToServer(message) {
  console.log("Sending message to server:", message);
  const signalingSocket = new WebSocket(signaling_url);
  signalingSocket.addEventListener("open", () => signalingSocket.send(JSON.stringify(message)));
  signalingSocket.addEventListener("close", () => console.error("Signaling socket closed unexpectedly"));
}

const signalingSocket = new WebSocket(signaling_url);
signalingSocket.addEventListener("message", async (event) => {
  const message = JSON.parse(event.data);
  console.log("Received message from server:", message);

  if (message.description) {
    console.log("Remote SDP:", message.description.sdp);
    await pc.setRemoteDescription(new RTCSessionDescription(message.description));
    if (message.description.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("Local SDP:", answer.sdp);
      sendToServer({ description: answer });
    }
  } else if (message.candidate) {
    console.log("Remote ICE candidate:", message.candidate);
    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
  } else if (message.hangup) {
    hangup();
  }
});
