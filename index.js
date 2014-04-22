var isChrome = !!navigator.userAgent.match(/Chrome/),
    getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia,
    getUserMedia = getUserMedia.bind(navigator),
    eventChannel = new Firebase('https://osv731ljk01.firebaseio-demo.com/'),
    peer = new Peer();

peer.on('error', function (e) {
    console.log(e.stack);
    throw e;
});
if (isChrome) {
    eventChannel.remove();
    peer.on('settings', function (r) {
        eventChannel.push(JSON.parse(JSON.stringify(r)));
    });
    eventChannel.on('value', function (r) {
        var v = r.val();
        if (v && v.answer) {
            peer.update(v);
        }
    });
    /*peer.createChannel();*/
} else {
    eventChannel.on('value', function (r) {
        var pull = r.val();
        if (!pull) {
            return;
        }
        Object.keys(pull).forEach(function (key) {
            var val = pull[key];
            peer.update(val);
        });
    });

    peer.on('settings', function (r) {
        var a = JSON.parse(JSON.stringify(r));
        eventChannel.set(a);
    });
}



window.addEventListener('load', function () {
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
}, false);
