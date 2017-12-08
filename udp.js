// Generated by CoffeeScript 1.10.0
var dgram, ndjson, stream;

dgram = require('dgram');

ndjson = require('ndjson');

stream = require('stream');

module.exports = {
  client: function(config) {
    var address, port, ref, ref1, res, udpClient, version;
    version = (config != null ? config.ipv6 : void 0) ? 'udp6' : 'udp4';
    port = (ref = config != null ? config.port : void 0) != null ? ref : 8125;
    address = (ref1 = config != null ? config.address : void 0) != null ? ref1 : void 0;
    udpClient = dgram.createSocket(version);
    res = {
      emit: function(message, cb) {
        var data;
        data = JSON.stringify(message);
        data += '\n';
        return udpClient.send(data, port, address, function(err) {
          if (cb == null) {
            return;
          }
          return cb(err);
        });
      },
      copy: function() {
        return res;
      },
      close: function(cb) {
        return tcpClient.close();
      }
    };
    return res;
  },
  server: function(config, cb) {
    var address, kids, port, ref, ref1, res, socket, udpServer, version;
    kids = [];
    version = (config != null ? config.ipv6 : void 0) ? 'udp6' : 'udp4';
    port = (ref = config != null ? config.port : void 0) != null ? ref : 8125;
    address = (ref1 = config != null ? config.address : void 0) != null ? ref1 : void 0;
    udpServer = dgram.createSocket(version);
    socket = new stream.PassThrough();
    udpServer.on('message', function(data, info) {
      return socket.write(data.toString('utf-8'));
    });
    socket = socket.pipe(ndjson.parse());
    socket.on('error', function(err) {
      return tcpServer.emit('error', err);
    });
    socket.on('data', function(e) {
      var i, k, len, results;
      results = [];
      for (i = 0, len = kids.length; i < len; i++) {
        k = kids[i];
        results.push(k.emit(e));
      }
      return results;
    });
    if (cb != null) {
      udpServer.on('error', function(err) {
        return cb(err);
      });
    }
    udpServer.bind(port, address);
    res = function(k) {
      kids.push(k);
      return res;
    };
    res.emit = function(e) {
      var i, k, len, results;
      results = [];
      for (i = 0, len = kids.length; i < len; i++) {
        k = kids[i];
        results.push(k.emit(e));
      }
      return results;
    };
    res.close = function(cb) {
      return udpServer.close(cb);
    };
    res.copy = function() {
      return res;
    };
    return res;
  }
};
