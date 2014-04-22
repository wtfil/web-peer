var isChrome = !!navigator.userAgent.match(/Chrome/),
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
    setTimeout(function () {
        /*peer.createChannel();*/
    }, 2000);
    /*peer.send({foo: 'bar'});*/
} else {
    eventChannel.on('value', function (r) {
        var pull = r.val();
        if (!pull) {
            return;
        }
        /*console.log(pull);*/
        Object.keys(pull).forEach(function (key) {
            var val = pull[key];
            peer.update(val);
        });
    });
}

/*
p2
    .on('settings', function (settings) {
    })
    .on('error', function (e) {
        throw e;
    });

p1
    .on('settings', function (settings) {
        console.log('settings', settings);
        p2.update(settings);
        console.log(p1._channel.readyState);
    })
    .on('peer', function () {
        
    })
    .on('error', function (e) {
        throw e;
    });

setTimeout(function () {
    p1.send({foo: 4});
}, 2000);
*/
