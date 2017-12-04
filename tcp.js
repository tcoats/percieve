// Generated by CoffeeScript 1.10.0
var net;

net = require('net');

module.exports = {
  client: function(config) {
    var address, port, ref, ref1, tcpClient;
    port = (ref = config != null ? config.port : void 0) != null ? ref : 8125;
    address = (ref1 = config != null ? config.address : void 0) != null ? ref1 : void 0;
    tcpClient = net.connect(port, address);
    tcpClient.setEncoding('utf8');
    return {
      send: function(message, cb) {
        return tcpClient.write(JSON.stringify(message));
      },
      close: function(cb) {
        return tcpClient.close();
      }
    };
  },
  server: function(config, cb) {
    var address, port, ref, ref1, tcpServer;
    port = (ref = config != null ? config.port : void 0) != null ? ref : 8125;
    address = (ref1 = config != null ? config.address : void 0) != null ? ref1 : void 0;
    tcpServer = net.createServer(function(socket) {
      socket.setEncoding('utf8');
      socket.on('error', function(err) {
        return tcpServer.emit('error', err);
      });
      return socket.on('data', function(data) {
        return cb(null, JSON.parse(data));
      });
    });
    tcpServer.on('error', function(err) {
      return cb(err);
    });
    tcpServer.listen(port, address);
    return {
      close: function(cb) {
        return tcpServer.close();
      }
    };
  }
};
