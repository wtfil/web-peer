/*jshint maxlen: 1000*/
var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;

var server = {
    iceServers: [
        {url: "stun:23.21.150.121"},
        {url: "stun:stun.l.google.com:19302"},
        {url: "turn:numb.viagenie.ca", credential: "webrtcdemo", username: "louis%40mozilla.com"}
    ]
};

var options = {
    optional: [
        {DtlsSrtpKeyAgreement: true},
        {RtpDataChannels: true}
    ]
};

var constraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
    }
};

function Peer() {

    this._listeners = Object.create(null);
    this._messagePull = [];
    this._iceCandidate = null;
    this._createConnection();

}

Peer.prototype._createConnection = function () {
    var _this = this,
        pc;

    try {
        pc = new PeerConnection(server, options);
    } catch(e) {
        return this._emit('error', e);
    }
    this._pc = pc;
    this._channel = null;
    
    pc.onicecandidate = function (e) {
        if (e.candidate === null) {
            return;
        }
        pc.onicecandidate = null;
        _this._emit('sync', {candidate: e.candidate});
    };
    pc.onaddstream  = function (stream) {
        _this._emit('stream', stream.stream);
    };
    pc.ondatachannel = function (e) {
        var channel = e.channel;
        _this._channel = channel;
        channel.onmessage = _this._onChannelMessage.bind(_this);
    };

};


Peer.prototype.invite = function (options) {
    var _this = this;

    this._pc.createOffer(
        function (offer) {
            _this._pc.setLocalDescription(offer);
            _this._emit('sync', {offer: offer});
        },
        this._emit.bind(this, 'error'),
        options || constraints
    );

    return this;
};

Peer.prototype.renew = function (settings) {
    var streams = this._pc.getLocalStreams();
    this._pc.close();
    this._createConnection();

    streams.forEach(function (stream) {
        this._pc.addStream(stream);
    }, this);

    this.sync(settings);
    this._pc.addIceCandidate(new RTCIceCandidate(this._iceCandidate));
    this._emit('reconnect');
};

Peer.prototype.sync = function (opts) {
    var settings = 'object' === typeof opts ? opts : JSON.parse(opts),
        pc = this._pc,
        _this = this;
    
    if (settings.offer) {
        pc.setRemoteDescription(new SessionDescription(settings.offer), function () {
            pc.createAnswer(
                function (answer) {
                    pc.setLocalDescription(answer);
                    _this._emit('sync', {answer: answer});
                },
                _this._emit.bind(_this, 'error'),
                constraints
            );

        }, function () {
            _this.renew(settings);
        });
    }

    if (settings.candidate) {
        /*if (pc.iceConnectionState === 'new') {*/
        this._iceCandidate = settings.candidate;
        this._pc.addIceCandidate(new RTCIceCandidate(settings.candidate));
            /*} else {*/
                /*this._pc.close();*/
                /*this._createConnection();*/
                /*setTimeout(function () {*/
                    /*_this._pc.addIceCandidate(new RTCIceCandidate(settings.candidate));*/
            /*}, 1000);*/
            /*}*/
    }

    if (settings.answer) {
        this._pc.setRemoteDescription(new SessionDescription(settings.answer));
    }


};

Peer.prototype._emit = function (name, data) {
    if (this._listeners[name]) {
        this._listeners[name].forEach(function (haldler) {
            haldler(data);
        });
    }
    return this;
};

Peer.prototype.on = function (name, haldler) {
    if (!this._listeners[name]) {
        this._listeners[name] = [];
    }
    this._listeners[name].push(haldler);
    return this;
};

Peer.prototype.createChannel = function () {
    var options = {
        reliable: false,
    },
        _this = this,
        channel = this._pc.createDataChannel('myLabel', options);

    channel.onopen = function () {
        _this._messagePull.forEach(function (message) {
            channel.send(message);
        });
    };

    channel.onerror = function () {
        console.log('error', arguments);
    };

    channel.onmessage = this._onChannelMessage.bind(this);

    this._channel = channel;
    this.invite();
};

Peer.prototype._onChannelMessage = function (e) {
    this._emit('data', e.data);
};

Peer.prototype.addStream = function (stream) {
    this._pc.addStream(stream);
    this.invite();
};


Peer.prototype.send = function (data) {
    if (!this._channel) {
        this.createChannel();
    }
    if ('open' !== this._channel.readyState) {
        this._messagePull.push(data);
    } else {
        this._channel.send(data);
    }
};
