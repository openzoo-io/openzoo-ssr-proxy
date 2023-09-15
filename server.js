require('custom-env').env(process.env.NODE_ENV);
const express = require('express');
const cheerio = require('cheerio');
const axios = require('axios').default;
const NodeCache = require("node-cache");
const request = require('request');

const cache = new NodeCache();
const app = express();
const PORT = process.env.PORT || 45678;

function hasExt( url ) {
    var parts = url.split('/'),
        last  = parts.pop();
    return (last.indexOf('.') != -1);
}

function isStaticRequest(url) {
    return hasExt(url) && !url.endsWith('html');
}

async function getMetadata(params) {
    const metaApiRequestUrl = process.env.API + '/' + params;
    let meta = null;
    if(cache.has(params)) {
        meta = cache.get(params);
    } else {
        meta = await axios.get(metaApiRequestUrl)
            .then(resp => resp.data.data)
            .then(metadata => {
                cache.set(params, metadata, process.env.CACHE_TTL);
                return metadata;
            })
            .catch(_err => null);
    }
    return meta;
}

function updateMetaTags(targetHtml, meta) {
    const $ = cheerio.load(targetHtml);
    const hasAllKeys = ['name', 'description', 'image'].every(key => key in meta); 

    if(!meta || !hasAllKeys)
        return $.html();

    $('[property="og:title"],[name="twitter:title"]').attr('content', meta.name);
    $('[name="description"],[name="twitter:description"],[property="og:description"]').attr('content', meta.description);
    $('[property="og:image"],[name="twitter:image"]').attr('content', meta.image);

    return $.html();
}

app.use((req, _res, next) => {
    req.toUrl = process.env.TARGET + req.originalUrl;
    next();
});

// Example request: http://localhost:3000/clear-cache/collection/0x11b574de3814ac6e1eea09a4613d4f56b98546f3/5
app.get('/clear-cache/*', (req,res) => {
    const key = req.params[0];
    if(!cache.has(key)) 
        return res.sendStatus(404);
    
    cache.del(key);
    res.sendStatus(200);
});

app.get('/*', async (req,res) => {
    try {
        if(isStaticRequest(req.toUrl))
        return request.get(req.toUrl).pipe(res);

        const targetResponse = (await axios.get(req.toUrl)).data;
        const meta = await getMetadata(req.params[0]);
        if(!meta)
            return res.send(targetResponse);

        return res.send(updateMetaTags(targetResponse, meta));
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy listening at ${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`API: ${process.env.API}`);
    console.log(`TARGET: ${process.env.TARGET}`);
});
