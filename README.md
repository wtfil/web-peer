web-peer
========

Easy way to use WebRTC

## What can do

* Send ```MediaStreams``` (audio, video)
* Send messages
* Send files


## Install

    npm install web-peer

## How to use

Web-peer provide only client-side interface for WebRTC. You should use some signaling mechanism.

Example of using with [socket.id](http://socket.io/):

```js
var socket = require('socket.io-client').connect(window.location.host),
    Peer = require('web-peer'),
    peer = new Peer();


peer.on('error', console.error.bind(console));
peer.on('sync', socket.emit.bind(socket, 'sync'));
socket.on('sync', peer.sync.bind(peer));
```


## Api


### Peer()

    Creates new peer

    ```js
    var peer = new Peer();
    ```

### Peer#send(messageName, messageData)
    
    send message
    
    ```js
    peer.send('to-chat', {name: 'boss'});
    ```
    
    on another side

    ```js
    peer.messages.on('to-chat', function (info) {
        console.log('%s joined to chat', info.name); // boss joined to chat
    });
    ```

### Peer#addStream(mediaStream)

    send [```MediaStream```](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)

    ```js
    getUserMedia({ audio: true, video: true }, function (stream) {
        peer.addStream(stream);
    }, console.error.bind(console));
    ```

    on another side

    ```js
    peer.on('stream', function (mediaStream) {
        var video = document.querySelector('video');
        video.src = URL.createObjectURL(mediaStream);
        video.play();
    });
    ```

### Peer#sendFile(file)
    
    send [```File```](https://developer.mozilla.org/en-US/docs/Web/API/File)
    
    ```js
    var input = document.querySelector('input[type=file]');

    input.addEventListener('change', function () {
        if (input.files.length) {
             peer.sendFile(input.files[0]);
        }
    });
    ```

    on another side

    ```
    // fileStream is instanceof private constructor ```FileStream``` which makes easier work with file
    peer.on('file', function (fileStream) {
        // file will load only after you allow it
        file.load();

        file.on('progress', function (progress) {
            document.querySelector('progress').value = progress;
        });

        file.on('url', function () {
            var link = document.querySelector('a');
            a.download = file.name;
            a.innerHTML = file.name;
            a.href = file.url;
        });
    });
    ```

### Peer events

* ```error```
* ```stream```
* ```file```


### FileStream#load()
    
    start load file

### FileStream#getBlob()
    
    get file blob

### FileStream#url
    
    url to [filesystem](https://developer.mozilla.org/en-US/docs/WebGuide/API/File_System) file location

### FileStream#name
    
    file name
