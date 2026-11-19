// Tiny SOAP mock used for demos and manual tests: node scripts/demo/mock-server.js
// WSDL: http://localhost:8099/weather?wsdl
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8099);
const env = (body) =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:w="http://cybersoap.dev/weather"><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
const pick = (xml, name) => (xml.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)<`)) || [])[1];

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end(fs.readFileSync(path.join(__dirname, 'weather.wsdl')));
      }
      const action = String(req.headers.soapaction || '');
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      const raw = pick(body, 'City');
      const city = !raw || raw === '?' ? 'Paris' : raw;
      if (raw === '') {
        res.statusCode = 500;
        return res.end(env('<soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring>City is required</faultstring></soapenv:Fault>'));
      }
      const f = pick(body, 'Unit') === 'F';
      const t = (c) => (f ? (c * 9) / 5 + 32 : c).toFixed(1);
      if (action.includes('GetForecast')) {
        const days = Math.min(Number(pick(body, 'Days')) || 3, 7);
        const d = [...Array(days)].map((_, i) => {
          const date = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10);
          return `<w:Day><w:Date>${date}</w:Date><w:Min>${t(6 + i)}</w:Min><w:Max>${t(14 + i)}</w:Max></w:Day>`;
        });
        return res.end(env(`<w:GetForecastResponse>${d.join('')}</w:GetForecastResponse>`));
      }
      if (action.includes('ListCities')) {
        return res.end(env('<w:ListCitiesResponse><w:City>Paris</w:City><w:City>Lyon</w:City><w:City>Marseille</w:City></w:ListCitiesResponse>'));
      }
      res.end(
        env(
          `<w:GetWeatherResponse><w:City>${city}</w:City><w:Temperature>${t(18.4)}</w:Temperature><w:Condition>Sunny</w:Condition><w:Humidity>42</w:Humidity></w:GetWeatherResponse>`
        )
      );
    });
  })
  .listen(PORT, () => console.log(`SOAP mock on http://localhost:${PORT}/weather?wsdl`));
