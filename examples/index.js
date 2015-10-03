var Peer = require('../peer');
var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
var getUserMedia = getUserMedia.bind(navigator);
var socket = require('socket.io-client').connect(window.location.host);
var peer = new Peer();

peer.on('error', function (e) {
    throw e;
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
    var input = document.querySelector('input[type=file]'),
        progress = document.querySelector('progress'),
        link = document.querySelector('a');

    peer.on('file', function (file) {
        file.load();
        file.on('progress', function (val) {
            progress.value = val;
        });
        file.on('url', function () {
            link.download = file.name;
            link.innerHTML = file.name;
            link.href = file.url;
        });
        file.on('error', function (e) {
            throw e;
        });
    });

    input.addEventListener('change', function () {
        if (input.files.length) {
            peer.sendFile(input.files[0]);
        }
    });
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

    peer.on('stream', setStream.bind(null, remote));

    document.querySelector('.video-on').addEventListener('click', function () {
        getUserMedia({ audio: true, video: true }, function (stream) {
            setStream(local, stream);
            peer.addStream(stream);
        }, console.error.bind(console));
    }, true);

    function addMessage(message, me) {
        messages.innerHTML += (me ? '>>: ' : '<<: ') + message + '<br/>';
    }

    peer.messages.on('chat', function (text) {
        addMessage(text, false);
    });

    input.addEventListener('keydown', function (e) {
        if ('Enter' === e.keyIdentifier) {
            var val = input.value;
            input.value = '';
            peer.send('chat', val);
            addMessage(val, true);
            e.preventDefault();
        }
    }, false);

}, false);
