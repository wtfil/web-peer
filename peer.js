/*jshint maxlen: 1000*/
/*global FileReader*/
(function (window) {

    var EventEmitter = require('events').EventEmitter;
    var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
    var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
    var requestFileSystem = window.requestFileSystem ||  window.webkitRequestFileSystem || window.mozRequestFileSystem;
    var MAX_CHUNK_SIZE = 152400,
        RETRY_INTERVAL = 300,
        STATUS_NEW = 'new',
        STATUS_START = 'started',
        STATUS_END = 'finished';

    var peerServer = {
        iceServers: [
            {url: 'stun:23.21.150.121'},
            {url: 'stun:stun.l.google.com:19302'},
            {url: 'turn:numb.viagenie.ca', credential: 'webrtcdemo', username: 'louis%40mozilla.com'}
        ]
    };

    var peerOptions = {
        optional: [
            {DtlsSrtpKeyAgreement: true}
        ]
    };

    var channelOptions = {
        reliable: true
    };


    var constraints = {
        optional: [],
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true
        }
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
        this._chunks = [];
        this._size = options.size;
        this._type = options.type;
        this.name = options.name;
        EventEmitter.call(this);
    }

    FileStream.prototype = Object.create(EventEmitter.prototype);
    FileStream.prototype.constructor = FileStream;

    /**
     * Adding chunk to buffer
     *
     * @param {ArrayBuffer} buff
     */
    FileStream.prototype.append = function (buff) {
        this._chunks.push(buff);
        this._loaded += buff.byteLength || buff.size;
        this.emit('progress', this._loaded / this._size);
        if (this._loaded >= this._size) {
            this._createUrl();
        }
        return this;
    };

    /**
     * Starting load file
     */
    FileStream.prototype.load = function () {
        return this.emit('start');
    };


    Object.defineProperty(FileStream.prototype, 'url', {
        get: function () {
            if (!this._url) {
                throw new Error('.url is not avaliable until file loads');
            }
            return this._url;
        }
    });

    FileStream.prototype._createUrl = function () {
        var blob = this.getBlob(),
            onError = this.emit.bind(this, 'error'),
            _this = this;

        if (!requestFileSystem) {
            this._url = URL.createObjectURL(blob);
            _this.emit('url', this._url);
            _this.emit('load');
            return;
        }

        requestFileSystem(window.TEMPORARY, blob.size, function (fs) {
            fs.root.getFile(_this.name, {create: true}, function (fileEntry) {

                _this._url = fileEntry.toURL();
                _this.emit('url', _this._url);
                fileEntry.createWriter(function (writer) {
                    writer.onerror = onError;
                    writer.onwriteend = function () {
                        _this.emit('load');
                    };
                    writer.write(blob);
                }, onError);

            }, onError);
        }, onError);
    };

    /**
     * Getting blob from stream
     *
     * @return {Blob} file
     */
    FileStream.prototype.getBlob = function () {
        return new Blob(this._chunks, {type: this._type});
    };


    /**
     * WebRTC peer connection wrapper
     * @constructor
     */
    function Peer() {
        this._messagePull = [];
        this._iceCandidate = null;
        this._files = {
            received: {},
            sent: {}
        };
        this._createConnection();
        this.messages = new EventEmitter();
        EventEmitter.call(this);
    }

    Peer.prototype = Object.create(EventEmitter.prototype);
    Peer.prototype.constructor = Peer;

    Peer.prototype._createConnection = function () {
        var _this = this,
            pc;

        try {
            pc = new PeerConnection(peerServer, peerOptions);
        } catch(e) {
            return this.emit('error', e);
        }
        this._pc = pc;
        this._channel = null;

        pc.onicecandidate = function (e) {
            if (e.candidate === null) {
                return;
            }
            pc.onicecandidate = null;
            _this.emit('sync', {candidate: e.candidate});
        };
        pc.onaddstream  = function (data) {
            if (data.stream.id !== 'default') {
                _this.emit('stream', data.stream);
            }
        };
        pc.ondatachannel = function (e) {
            var channel = e.channel;
            _this._channel = channel;
            channel.onmessage = _this._onChannelMessage.bind(_this);
        };
        pc.oniceconnectionstatechange = function (e) {
            if (pc.iceConnectionState == 'disconnected') {
                _this.emit('disconnect');
                _this._createConnection();
            }
        };

    };


    /**
     * Create offer with current state of connection
     */
    Peer.prototype._createOffer = function () {
        var _this = this;

        this._pc.createOffer(
            function (offer) {
                _this._pc.setLocalDescription(offer);
                _this.emit('sync', {offer: offer});
            },
            this.emit.bind(this, 'error'),
            constraints
        );

        return this;
    };

    /**
     * Reopen connection
     * @param {Object} settings same to .sync()
     */
    Peer.prototype._renew = function (settings) {
        var streams = this._pc.getLocalStreams();
        this._pc.close();
        this._createConnection();

        streams.forEach(function (stream) {
            this._pc.addStream(stream);
        }, this);

        this.sync(settings);
        this._pc.addIceCandidate(new RTCIceCandidate(this._iceCandidate));
        this.emit('reconnect');
    };

    /**
     * Sync with another peer
     *
     * @param {String|Object} opts
     * @param {Object} [opts.offer] of another peer
     * @param {Object} [opts.candidate] new ice candidate
     * @param {Object} [opts.answer] of answer peer
     */
    Peer.prototype.sync = function (opts) {
        var settings = 'object' === typeof opts ? opts : JSON.parse(opts),
            pc = this._pc,
            _this = this;

        if (settings.offer) {
            pc.setRemoteDescription(new SessionDescription(settings.offer), function () {
                pc.createAnswer(
                    function (answer) {
                        pc.setLocalDescription(answer);
                        _this.emit('sync', {answer: answer});
                    },
                    _this.emit.bind(_this, 'error'),
                    constraints
                );

            }, function () {
                _this._renew(settings);
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

    /**
     * Create data channel
     */
    Peer.prototype._createChannel = function () {
        var _this = this,
            channel = this._pc.createDataChannel('myLabel', channelOptions);

        channel.onopen = function () {
            channel.binaryType = 'arraybuffer';
            _this._tryToSendMessages();
        };

        channel.onerror = this.emit.bind(this, 'error');

        channel.onmessage = this._onChannelMessage.bind(this);

        this._channel = channel;
        this._createOffer();
    };

    function readFileAsStream(file, onProgress, onDone) {
        var reader = new FileReader(),
            loaddedBefore = 0;

        reader.readAsArrayBuffer(file);
        reader.onprogress = function (e) {
            if (!reader.result) {
                return;
            }

            var loaded = e.loaded,
                chunk, index;

            for (index = loaddedBefore; index < loaded; index += MAX_CHUNK_SIZE) {
                chunk = reader.result.slice(index, index + MAX_CHUNK_SIZE);
                onProgress(chunk);
            }

            loaddedBefore = e.loaded;
        };

        reader.onloadend = function () {

            var loaded = reader.result.byteLength,
                index, chunk;

            for (index = loaddedBefore; index < loaded; index += MAX_CHUNK_SIZE) {
                chunk = reader.result.slice(index, index + MAX_CHUNK_SIZE);
                onProgress(chunk);
            }

            onDone();
        };
    }

    Peer.prototype._sendFile = function (id) {
        var file = this._files.sent[id],
            _this = this;

        readFileAsStream(
            file,
            this._send.bind(this),
            function () {
                _this._send({
                    file: id,
                    status: STATUS_END
                });
            }
        );
    };

    /**
     * Data channel message handler
     */
    Peer.prototype._onChannelMessage = function (e) {
        var data = e.data,
            _this = this,
            file;

        if (data instanceof ArrayBuffer || data instanceof Blob) {
            return this._lastFile.append(data);
        }

        data = JSON.parse(data);

        if (data.message) {
            return this.messages.emit(data.message, data.data);
        }
        if (data.file) {
            switch (data.status) {
                case STATUS_NEW:
                    file = new FileStream(data);
                    file.on('start', function () {
                        _this._send({
                            file: data.file,
                            status: STATUS_START
                        });
                    });
                    this.emit('file', file);
                    this._lastFile = this._files.received[data.file] = file;
                    break;

                case STATUS_START:
                    this._sendFile(data.file);
                    break;

                case STATUS_END:
                    this.emit('file load', this._lastFile.getBlob());
                    break;
            }

        }

    };

    /**
     * Add media stream
     *
     * @param {MediaStream} stream
     */
    Peer.prototype.addStream = function (stream) {
        this._pc.addStream(stream);
        this._createOffer();
    };

    /**
     * Sending json or ArrayBuffer to peer
     * @private
     *
     * @param {ArrayBuffer|Object} message
     */
    Peer.prototype._send = function (message) {
        if (!this._channel) {
            this._createChannel();
        }

        message = message instanceof ArrayBuffer ? message : JSON.stringify(message);

        this._messagePull.push(message);

        if ('open' === this._channel.readyState) {
            this._tryToSendMessages();
        }
    };

    /**
     * Send data to peer
     * @param {String} name
     * @param {Mixed} data
     */
    Peer.prototype.send = function (name, data) {
        this._send({
            message: name,
            data: data
        });
        return this;
    };

    Peer.prototype._tryToSendMessages = function (isRetry) {
        var pull = this._messagePull,
            message;

        if (!isRetry && this._messageRetryTimer) {
            return;
        }

        if (this._messageRetryTimer) {
            clearTimeout(this._messageRetryTimer);
            this._messageRetryTimer = null;
        }

        while((message = pull.shift())) {
            try {
                this._channel.send(message);
            } catch(e) {
                message.id = Math.random();
                pull.unshift(message);
                this._messageRetryTimer = setTimeout(this._tryToSendMessages.bind(this, true), RETRY_INTERVAL);
                this.emit('error', e);
                break;
            }
        }
    };

    /**
     * Send file to peer
     *
     * @param {File} file
     */
    Peer.prototype.sendFile = function (file) {
        var id = Date.now() + Math.random();
        this._files.sent[id] = file;
        this._send({
            file: id,
            name: file.name,
            size: file.size,
            type: file.type,
            status: STATUS_NEW
        });
    };

    /**
     * Close connection
     */
    Peer.prototype.close = function () {
        this._pc.close();
        this.emit('close');
        this.removeAllListeners();
    };

    /*global define*/
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = Peer;
    } else if (typeof define === 'function' && define.amd) {
        define(Peer);
    } else {
        window.Peer = Peer;
    }

}(window));
