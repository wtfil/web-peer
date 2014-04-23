/*global io, Peer*/
/*var isChrome = !!navigator.userAgent.match(/Chrome/),*/
var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia,
    getUserMedia = getUserMedia.bind(navigator),
    socket = io.connect(window.location.host),
    peer = new Peer();

peer.on('error', function (e) {
    throw e;
});

peer.on('data', function (data) {
    console.log('data from peer', data);
});


// locking for someone
socket.emit('find');

// if create channel if someone look at me
socket.on('find', function () {
    console.log('socket on find');
    peer.createChannel();
});

// syncing peers
socket.on('sync', function (data) {
    console.log('socket on sync', data);
    peer.sync(data);
});
peer.on('sync', function (data) {
    console.log('peer on sync', data);
    socket.emit('sync', data);
});

window.addEventListener('load', function () {
    /*
    var video = document.createElement('video');
    document.body.appendChild(video);

    function setStream(stream) {
        video.src = URL.createObjectURL(stream);
        video.play();
    }

    if (isChrome) {
        
        getUserMedia({ audio: true, video: true }, function (stream) {
            setStream(stream);
            peer.addStream(stream);
        }, console.error.bind(console));
    } else {
        peer.on('stream', setStream);
    }
    */
}, false);
