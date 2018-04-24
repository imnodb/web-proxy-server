
import * as net from 'net';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import * as os from 'os';
import { exec } from 'child_process';

const IPLIST = ['localhost'];

function _replySync(socket: net.Socket, code: Number, reason: String, headers: any, cb: Function) {
  try {
    const statusLine = 'HTTP/1.1 ' + code + ' ' + reason + '\r\n';
    let headerLines = '';
    for (const key in headers) {
      headerLines += key + ': ' + headers[key] + '\r\n';
    }
    socket.write(statusLine + headerLines + '\r\n', 'UTF-8', cb);
  } catch (error) {
    console.log(error);
    cb();
  }
}

function _requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const reqUrlObj: url.UrlWithStringQuery = url.parse(req.url);
    const requestOptions = {
      host: reqUrlObj.hostname,
      port: parseInt(reqUrlObj.port, 10) || 80,
      path: reqUrlObj.path,
      method: req.method,
      headers: req.headers,
    };

    this.emit('proxyReq', requestOptions);

    // 检查request host防止请求自身服务
    if (requestOptions.port === this.address().port) {
      if (IPLIST.indexOf(requestOptions.host) !== -1) {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write('ok');
        res.end();
        return;
      }
    }

    requestRemote(requestOptions, req, res, this);

  } catch (e) {
    console.log('requestHandlerError' + e.message);
  }

  function requestRemote(requestOptions: http.RequestOptions, req: http.ServerRequest, res: http.ServerResponse, proxy: ProxyServer) {
    const remoteRequest: http.ClientRequest = http.request(requestOptions, function (remoteResponse: http.IncomingMessage) {
      res.setHeader('proxy-agent', 'Node-Web-Proxy/1.1');
      res.setHeader('x-server-remote-address', requestOptions.host + ':' + requestOptions.port);

      // write out headers to handle redirects
      res.writeHead(remoteResponse.statusCode, remoteResponse.statusMessage, remoteResponse.headers);

      proxy.emit('proxyRes', remoteResponse);

      if (remoteResponse.statusCode === 304 && remoteResponse.headers['content-length']) {
        // fix ng 返回304还带content-length 的 bug
        res.end();
        remoteRequest.end();
        return;
      }
      remoteResponse.pipe(res);
      // Res could not write, but it could close connection
      // res.pipe(remoteResponse);
    });

    remoteRequest.on('error', function (e) {
      proxy.emit('ProxyError', e, req, res);

      res.writeHead(502, 'Proxy fetch failed');
      console.log('Proxy fetch failed', e);
      res.end();
      remoteRequest.end();
    });
    // Just in case if socket will be shutdown before http.request will connect
    // to the server.
    res.on('close', function () {
      remoteRequest.abort();
    });

    req.pipe(remoteRequest);

  }

}

function _connectHandler(req: http.IncomingMessage, socket: net.Socket, head: Buffer) {
  try {
    const requestOptions = {
      host: req.url.split(':')[0],
      port: parseInt(req.url.split(':')[1], 10) || 443,
    };

    this.emit('proxyReq', requestOptions);

    connectRemote(requestOptions, socket);


    function onTunnelError(e: Event) {
      this.emit('ProxyError', e);
      console.log(req.url + 'Web tunnel error: ' + e);
      _replySync(socket, 502, 'Web Tunnel Error', {}, function () {
        try {
          socket.end();
        }
        catch (e) {
          console.log(e);
        }

      });
    }

    function connectRemote(requestOptions: net.TcpSocketConnectOpts, socket: net.Socket) {
      const tunnel = net.createConnection(requestOptions, function () {
        _replySync(socket, 200, 'Connection Established', {
          'Connection': 'keep-alive',
          'Proxy-Agent': 'Node-Web-Proxy/1.1',
        },
          function () {
            tunnel.pipe(socket);
            socket.pipe(tunnel);
          }
        );
      });

      tunnel.setNoDelay(true);

      tunnel.on('error', onTunnelError);
      // tunnel.on('end', function () {
      //   console.log('--------end');
      // });
    }
  } catch (e) {
    console.log('connectHandler error: ' + e.message);
  }
}



export default class ProxyServer extends http.Server {

  constructor(proxyListener?: (proxyReqOpts: http.RequestOptions | net.TcpSocketConnectOpts) => void) {
    super();
    this.on('request', _requestHandler);
    this.on('connect', _connectHandler);
    this.on('proxyReq', proxyListener || function () { });
    this.on('listening', function () {
      IPLIST.splice(1, IPLIST.length);
      const interfaces = os.networkInterfaces();
      for (const key in interfaces) {
        for (const interfaceInfo of interfaces[key]) {
          IPLIST.push(interfaceInfo.address);
        }
      }
      console.log('listening', IPLIST);
    });
  }

}

