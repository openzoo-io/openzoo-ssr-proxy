require('custom-env').env(process.env.NODE_ENV);
const express = require('express');
const request = require('request');
const cheerio = require('cheerio');
const axios = require('axios').default;
const NodeCache = require( "node-cache" );

const cache = new NodeCache();
const app = express();
const PORT = process.env.PORT || 3000;

function isStaticRequest(url) {
    const staticFileRegex = /\.(css|js|jpg|png|toff|svg|map|json|hdr|svg|ico|txt)$/i;
    const staticPaths = [
        '/static/',
        '/assets/',
        '/public/',
    ];

    return staticFileRegex.test(url) || staticPaths.some(p => url.includes(p));
}

app.use((req,res,next) => {
    req.fromUrl = req.url;
    req.toUrl = process.env.TARGET + req.originalUrl;
    req.isStaticFileRequest = isStaticRequest(req.toUrl);
    next();
});

app.get('/*', async (req,res) => {
    if(req.isStaticFileRequest)
        return request(req.toUrl).pipe(res);

    const metaApiRequestUrl = process.env.API + '/' + req.params[0];
    try {
        let meta = null;
        if(cache.has(metaApiRequestUrl))
            meta = cache.get(metaApiRequestUrl);
        else {
            const response = await axios.get(metaApiRequestUrl);
            if(response.status === 200) {
                meta = response.data.data;
                cache.set(metaApiRequestUrl, meta, 10000);
            }
        }
        
        if(!meta)
            throw 'Error fetching meta data.';

        request(req.toUrl, function(error,response,body) {
            const $ = cheerio.load(body);
            $('[property="og:title"],[name="twitter:title"]').attr('content', meta.name);
            $('[name="description"],[name="twitter:description"],[property="og:description"]').attr('content', meta.description);
            $('[property="og:image"],[name="twitter:image"]').attr('content', meta.image);
    
            return res.send($.html());
        });
    } catch (error) {
        console.error(error);
        return request(req.toUrl).pipe(res);
    }
});

app.listen(PORT, () => {
    console.log(`Example app listening at ${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`API: ${process.env.API}`);
    console.log(`TARGET: ${process.env.TARGET}`);
});