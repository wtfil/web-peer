var app = require('koa')(),
    stat = require('koa-static'),
    http = require('http'),
    io = require('socket.io'),
    server;

app.use(stat('.'));
app.use(stat('..'));

server = http.Server(app.callback());
io = io.listen(server);

io.sockets.on('connection', function (socket) {
    socket.on('find', function () {
        socket.broadcast.emit('find');
    });
    socket.on('sync', function (data) {
        socket.broadcast.emit('sync', data);
    });
});

server.listen(3000);
