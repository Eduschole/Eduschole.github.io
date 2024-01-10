// refer to the WebRTC Overview google doc (ask Alejandro) if you want an overview of the design of this project and of WebRTC more generally 


// TODO: Apparently whenever we move on to production, we should do something caleld Token Authentication (refer to timestamp 35:40 of https://www.youtube.com/watch?v=QsH8FL0952k&t=1488s&ab_channel=TraversyMedia )
// this value should be kept private for reasons that elude me
let APP_ID = "997dfa04a0684e4db28dad60e50e72d5";

let token = null;
// unique user id
// TODO: come up with a better method to generate UIDs, for now, generating a random number will suffice
let uid = String(Math.floor(Math.random() * 10000));

// var referencing the client that we log in with
let client;
// the channel that two users actually join
let channel;
// variable for local video feed - the first peer's video feed
let localStream;
// variable for other peer's video feed - the remote feed
let remoteStream;
let peerConnection;

// connecting to free Google stun servers that generate ICE candidates
const servers = {
    iceServers:[
        {
            urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']
        }
    ]
}

// init function that runs at the beginning, asks the browser for access to camera and mic for the local stream
let init = async () => {
    // if these Agora methods do not make sense, you could always reference the Agora documentation (it's important to point out that we didn't download the latest version of the signaling SDK since we were running into problems getting AgoraRTM to be defined as a global variable)
    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({uid,token});
    
    // TODO: the parameter for createChannel will eventually have to be a unique room id
    channel = client.createChannel('main');
    await channel.join();

    // event listener that runs when another member joins the same room
    channel.on('MemberJoined',handleUserJoined); 
    channel.on('MemberLeft', handleUserLeft);
    // event listener that runs whenever we use sendMessageToPeer
    client.on('MessageFromPeer',handleMessageFromPeer);
    // we wait for the promise that indicates that we have access to the camera and mic to be fulfilled
    localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true})
    // we set the srcObject attribute of the video tag for user 1 equal to the fulfilled promise value, a.k.a localStream var
    document.getElementById('user-1').srcObject = localStream


}

let handleUserLeft = (MemberID) => {
    document.getElementById('user-2').style.display = 'none';
}

// event handler function that runs after a peer has sent a message to the other peer
let handleMessageFromPeer = async (message,MemberID) => {
    message = JSON.parse(message.text);
    if (message.type === 'offer'){
        createAnswer(MemberID,message.offer);
    }
    if (message.type === 'answer'){
        addAnswer(message.answer);
    }
    if (message.type === 'candidate'){
        if (peerConnection){
            peerConnection.addIceCandidate(message.candidate);
        }
    }


}

// event handler function that runs after a user has joined a room- merely notifies the peer that was in the room originally that a new peer joined
let handleUserJoined = async (MemberID) => {
    console.log('A new user joined the channel: ', MemberID);
    createOffer(MemberID);
}

let createPeerConnection = async (MemberID) => {
        // some object that allows us to create an SDP offer- it takes in our servers variable which stands for the STUN servers that generate ICE candidates
        peerConnection = new RTCPeerConnection(servers);
        // since we aren't dealing with the local stream, we give the remote stream a generic MediaStream object value instead of asking for video and audio permission like for the local stream
        remoteStream = new MediaStream();
        // set the srcObject attribute of the video tag equal to the value for remoteStream
        document.getElementById('user-2').srcObject = remoteStream
        // when a user joins, we want the display CSS property to be block so that we can show their video feed
        document.getElementById('user-2').style.display = 'block';
    
        if (!localStream){
               // we wait for the promise that indicates that we have access to the camera and mic to be fulfilled
            localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
        // we set the srcObject attribute of the video tag for user 1 equal to the fulfilled promise value, a.k.a localStream var
            document.getElementById('user-1').srcObject = localStream;
        }
    
        // loop through "tracks", which are basically pieces of audio and video, from the localStream and add them to the peer connection so that the remote stream will gain access to them
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track,localStream);
        })
    
        // listen for when the remote peer adds their tracks and gain access to those tracks
        peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                remoteStream.addTrack(track);
            })
        }
        // listens for the triggering of setLocalDescription(), generates ICE candidates
        peerConnection.onicecandidate = async (event) => {
            if (event.candidate){
                client.sendMessageToPeer({text:JSON.stringify({'type':'candidate', 'candidate':event.candidate})},MemberID)
            }
        }

}
// function that creates the first SDP offer (session description protocol offer)
let createOffer = async (MemberID) => {
    // function that abstracts the work needed to create a peer connection - something required to create an SDP offer and SDP answer
    await createPeerConnection(MemberID);
    // setting offer equal to a promise value
    let offer = await peerConnection.createOffer();
    // setting peerConnection attribute equal to the value of the promise returned above; when we use setLocalDescription, this triggers the event that makes the
    // onicecandidate event run, which generates the creation of ICE candidates
    await peerConnection.setLocalDescription(offer);

    // actually sends the SDP to the relevant peer
    client.sendMessageToPeer({text:JSON.stringify({'type':'offer', 'offer':offer})},MemberID)


}

let createAnswer = async (MemberID, offer) => {
    await createPeerConnection(MemberID)

    await peerConnection.setRemoteDescription(offer);

    let answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

        // actually sends the SDP to the relevant peer
        client.sendMessageToPeer({text:JSON.stringify({'type':'answer', 'answer':answer})},MemberID)

}

let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription){
        peerConnection.setRemoteDescription(answer);
    }
}
// we created this function to implement the display: none; video feed functionality so that the video is automatically hidden after a user leaves the channel- without this Agora would wait for a couple of seconds of inactivity before actually logging the user out
let leaveChannel = async () => {
    await channel.leave()
    await client.logout()
}

// before the window is closed, run leave channel
window.addEventListener('beforeunload',leaveChannel);
init();