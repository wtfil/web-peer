/*jshint maxlen: 1000*/
/*global FileReader*/
var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
var MAX_CHUNK_SIZE = 102400;

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


/**
 * Handle events
 */
function EventEmiter() {
    this._listeners = Object.create(null);
}

/**
 * Emiting event
 *
 * @private
 * @param {String} name of event
 * @param {Mixed} data passed into handler
 */
EventEmiter.prototype._emit = function (name, data) {
    if (this._listeners[name]) {
        this._listeners[name].forEach(function (haldler) {
            haldler(data);
        });
    }
    return this;
};

/**
 * Add subscriber
 *
 * @param {String} name of event
 * @param {Function} haldler
 */
EventEmiter.prototype.on = function (name, haldler) {
    if (!this._listeners[name]) {
        this._listeners[name] = [];
    }
    this._listeners[name].push(haldler);
    return this;
};

/**
 * Creating empty file that can be filled with chunks
 *
 * @constructor
 * @param {Object} options
 * @param {Number} options.size
 * @param {String} options.name
 * @param {String} options.type
 */ 
function FileStream(options) {
    this._loaded = 0;
    this._buff = new ArrayBuffer(options.size);
    this._view = new Uint8Array(this._buff);
    this._size = options.size;
    this._type = options.type;
    this._name = options.name;
    EventEmiter.call(this);
}

FileStream.prototype = Object.create(EventEmiter.prototype);
FileStream.prototype.constructor = FileStream;


/**
 * Adding chunk to buffer
 *
 * @param {ArrayBuffer} buff
 */
FileStream.prototype.append = function (buff) {
    var chunk = new Uint8Array(buff);
    this._view.set(chunk, this._loaded);
    this._loaded += buff.byteLength;
    this._emit('progress', this._loaded / this._size);
};

/**
 * Getting blob from stream
 *
 * @return {Blob} file
 */
FileStream.prototype.getBlob = function () {
    var file = new Blob([this._buff], {type: this._type});
    file.name = this._name;
    return file;
};

function Peer() {

    this._messagePull = [];
    this._iceCandidate = null;
    this._files = {};
    this._createConnection();
    EventEmiter.call(this);

}

Peer.prototype = Object.create(EventEmiter.prototype);
Peer.prototype.constructor = Peer;

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
        this._iceCandidate = settings.candidate;
        this._pc.addIceCandidate(new RTCIceCandidate(settings.candidate));
    }

    if (settings.answer) {
        this._pc.setRemoteDescription(new SessionDescription(settings.answer));
    }


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

    this._channel = channel;
    this.invite();
};

Peer.prototype._onChannelMessage = function (e) {
    var data = e.data,
        file;

    if (data instanceof ArrayBuffer) {
        return this._lastFile.append(data);
    }

    data = JSON.parse(data);

    if (data.message) {
        this._emit('data', e.data.message);
    } else if (data.file) {

        // TODO constant
        if (data.status === 'started') {
            file = new FileStream(data);
            this._lastFile = this._files[data.file] = file;
            this._emit('new file', file);
        } else if (data.status === 'finished') {
            this._emit('file', this._lastFile.getBlob());
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
    var reader = new FileReader(),
        id = Date.now() + Math.random(),
        loaddedBefore = 0,
        _this = this;

    reader.readAsArrayBuffer(file);
    reader.onprogress = function (e) {
        var loaded = e.loaded,
            chunk, index;

        for (index = loaddedBefore; index < loaded; index += MAX_CHUNK_SIZE) {
            chunk = reader.result.slice(index, index + MAX_CHUNK_SIZE);
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
