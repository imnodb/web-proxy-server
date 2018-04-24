const path = require("path");
const startChrome = require("start-chrome");
const proxyServer = require("../index");
const proxy = new proxyServer(function (proxyReqOpts) {
  console.log(proxyReqOpts);
});

proxy.listen(3001);
proxy.on("proxyReq", function (requestOptions) {
  console.log(1, "onBeforeRequest-----------");
});
proxy.on("proxyRes", function (remoteResponse) {
  console.log("proxyRes-----------", remoteResponse);
});
proxy.on("ProxyError", function (e) {
  console.log("ProxyError-----------", e);
});

console.log(proxy.address().port);
startChrome("http://open.biligame.com", {
  'user-data-dir': path.join(__dirname, './chrome-user-data'),
  'proxy-server': 'http://127.0.0.1:3001',
});

