/*global io, Peer*/
var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia,
    getUserMedia = getUserMedia.bind(navigator),
    socket = io.connect(window.location.host),
    peer = new Peer();

peer.on('error', function (e) {
    throw e;
});

peer.on('data', function (data) {
    console.log('data from peer: ', data);
});


// locking for someone
socket.emit('find');

// if create channel if someone look at me
socket.on('find', function () {
    console.log('socket on find');
    peer.send('hello');
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
    var local = document.querySelector('video.local'),
        remote = document.querySelector('video.remote'),
        input = document.querySelector('.input'),
        messages = document.querySelector('.messages');

    function setStream(video, stream) {
        video.src = URL.createObjectURL(stream);
        video.play();
    }

    function addMessage(message) {
        messages.innerHTML += (new Date()).toDateString() + ': ' + message + '<br/>';
    }

    getUserMedia({ audio: true, video: true }, function (stream) {
        setStream(local, stream);
        peer.addStream(stream);
    }, console.error.bind(console));

    peer.on('stream', setStream.bind(null, remote));

    peer.on('data', addMessage);

    input.addEventListener('keydown', function (e) {
        if ('Enter' === e.keyIdentifier && e.metaKey) {
            var val = input.value;
            input.value = '';
            peer.send(val);
            addMessage(val);
        }
    }, false);



}, false);
