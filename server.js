const express = require('express');
const request = require('request');
const { Crawler } = require('es6-crawler-detect');
const puppeteer = require("puppeteer");
const {writeFileSync, existsSync} = require('fs');
const {join} = require('path');

const port = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET || 'https://oz-ssr.vercel.app';
const app =  express();

const minimalArgs = [
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
  ];

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

    const browser = await puppeteer.launch({ headless: true, args: minimalArgs })
    const page = await browser.newPage();
    await page.goto(fullUrl, {'waitUntil':'networkidle0'});
    const html = await page.evaluate(() => document.querySelector('*').outerHTML);
    writeFileSync(filePath, html, 'utf-8');
    await browser.close();

    return filePath;
}

function isStatic(req) {
        // Proxy server doesn't have any static files. So it shouldn't be dealing with that...
        const staticFileRegex = /\.(css|js|jpg|png|toff|svg|map|json|hdr)$/i;
        const staticPaths = [
            '/static/',
            '/assets/',
            '/public/',
        ];
    
        return staticFileRegex.test(req.url) || staticPaths.some(p => req.url.includes(p));
}

app.get('*', async (req,res) => {

    req.root = TARGET_URL;
    const fullUrl =  TARGET_URL + req.originalUrl;

    if(new Crawler(req).isCrawler() && !isStatic(req)) {
        const path = await crawlerHandler(fullUrl);
        return res.sendFile(path);
    }

    return request(fullUrl).pipe(res);
});

app.listen(port, () => {
    console.log(`Example app listening at ${port}`);
});