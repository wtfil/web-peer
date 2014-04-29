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
    this._files = {};
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
        reliable: true,
    },
        _this = this,
        channel = this._pc.createDataChannel('myLabel', options);

    channel.onopen = function () {
        channel.binaryType = 'arraybuffer';
        setTimeout(function () {
            _this._messagePull.forEach(function (message) {
                channel.send(message);
            });
        }, 1000);
    };

    channel.onerror = function () {
        console.log('error', arguments);
    };

    channel.onmessage = this._onChannelMessage.bind(this);

    console.log(channel);
    this._channel = channel;
    this.invite();
};

Peer.prototype._onChannelMessage = function (e) {
    var data = e.data;

    if (data instanceof ArrayBuffer) {
        var chunk = new Uint8Array(data),
            all = new Uint8Array(this._lastFile.buff);

        all.set(chunk, this._lastFile.loaded);
        this._lastFile.loaded += data.byteLength;
        return;
    }

    data = JSON.parse(data);

    if (data.message) {
        this._emit('data', e.data.message);
    } else if (data.file) {

        // TODO constant
        if (data.status === 'started') {
            this._files[data.file] = {
                loaded: 0,
                type: data.type,
                buff: new ArrayBuffer(data.size)
            };
            this._lastFile = this._files[data.file];
        } else if (data.status === 'finished') {
            var file = new Blob([this._lastFile.buff], {type: this._lastFile.type});
            this._emit('file', file);
        }

    }

};

Peer.prototype.addStream = function (stream) {
    this._pc.addStream(stream);
    this.invite();
};

// TODO remove asIs
Peer.prototype.send = function (data, asIs) {
    var message = data instanceof ArrayBuffer ? data : JSON.stringify({
        message: data
    });

    // TODO remove asIs
    if (asIs) {
        message = JSON.stringify(data);
    }
    console.log(message);

    if (!this._channel) {
        this.createChannel();
    }

    if ('open' !== this._channel.readyState) {
        this._messagePull.push(message);
    } else {
        this._channel.send(message);
    }
};

Peer.prototype.sendFile = function (file) {
    /*global FileReader*/
    var reader = new FileReader(),
        id = Date.now() + Math.random(),
        loaddedBefore = 0,
        maxSize = 5000,
        _this = this;

    reader.readAsArrayBuffer(file);
    /*console.log(reader, file);*/
    /*return;*/
    reader.onprogress = function (e) {
        var loaded = e.loaded,
            chunk, index;

        for (index = loaddedBefore; index < loaded; index += maxSize) {
            chunk = reader.result.slice(index, index + maxSize);
            _this.send(chunk);
        }

        loaddedBefore = e.loaded;
    };

    reader.onloadstart = function () {
        _this.send({
            file: id,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'started'
        }, true);
    };

    reader.onloadend = function () {
        _this.send({
            file: id,
            status: 'finished'
        }, true);
    };
};
