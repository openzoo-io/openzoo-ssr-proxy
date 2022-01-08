const express = require('express');
const request = require('request');
const { Crawler } = require('es6-crawler-detect');
const puppeteer = require("puppeteer");
const {writeFileSync, existsSync} = require('fs');
const {join} = require('path');

const port = process.env.PORT || 5000;
const TARGET_URL = process.env.TARGET || 'https://openzoo-ssr-2-dv6fy9dh7-berkoztrk.vercel.app';
const app =  express();

/*
    TODO: 

    1- From client to ui piped to response
    2- From bot request snapshot send
    3- If snapshot not exist -> new snapshot
    4- If snapshot exist -> Take local snapshot

    # Start Vercel Configurations
    Project Settings > Environment Variables > PUBLIC_URL: Must be full url of the index
   
    # End Vercel Configuartions
*/

async function crawlerHandler(fullUrl) {
    const filePath = join(__dirname,`/snapshots/${encodeURIComponent(fullUrl)}.html`) ;
    
    if(existsSync(filePath))
        return filePath;

    const browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage();
    await page.goto(fullUrl);
    const html = await page.evaluate(() => document.querySelector('*').outerHTML);
    writeFileSync(filePath, html, 'utf-8');
    await browser.close();

    return filePath;
}

app.use((req,res, next) => {
    // Proxy server doesn't have any static files. So it shouldn't be dealing with that...
    const staticFileRegex = /\.(css|js|jpg|png|toff|svg|map|json)$/i;
    const staticPaths = [
        '/static/',
        '/assets/',
        '/public/',
    ];

    const isStatic = staticFileRegex.test(req.url) || staticPaths.some(p => req.url.includes(p));

    return isStatic ? res.sendStatus(404) : next();
});

app.get('*', async (req,res) => {

    req.root = TARGET_URL;
    const fullUrl =  TARGET_URL + req.originalUrl;

    if(new Crawler(req).isCrawler()) {
        const path = await crawlerHandler(fullUrl);
        return res.sendFile(path);
    }

    return request(fullUrl).pipe(res);
});

app.listen(port, () => {
    console.log(`Example app listening at ${port}`);
});