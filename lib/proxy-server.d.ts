/// <reference types="node" />
import * as net from 'net';
import * as http from 'http';
export default class ProxyServer extends http.Server {
    constructor(proxyListener?: (proxyReqOpts: http.RequestOptions | net.TcpSocketConnectOpts) => void);
}
