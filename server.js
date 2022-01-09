require('dotenv').config()
const express = require('express');
const request = require('request');
const puppeteer = require("puppeteer");
const AWS = require('aws-sdk');
const isbot = require('isbot');

const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET || 'https://oz-ssr.vercel.app';

const app =  express();
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: 's3-eu-central-1.amazonaws.com',
    signatureVersion: 'v4',
    region: 'eu-central-1'
});

let browserWSEndpoint = null;

/*
    .env FILE variables needs to be set:
    -------------------------------------------
    AWS_ACCESS_KEY_ID=<aws_access_key_id>
    AWS_SECRET_ACCESS_KEY=<aws_secret_key_value>
    PORT=<application port,optional will be 3000 by default>
    TARGET=https://oz-ssr.vercel.app
    SNAPSHOT_BUCKET_NAME=oz-snapshots
*/

async function isFileExists(fileName) {
    try{
        await s3.headObject({
            Bucket: process.env.SNAPSHOT_BUCKET_NAME,
            Key: fileName
        }).promise();
        return true;
    } catch(e) {
        return false
    }
}

async function getFile(mirrorUrl) {
    return s3.getSignedUrl('getObject', {
        Bucket: process.env.SNAPSHOT_BUCKET_NAME,
        Key: mirrorUrl,
        Expires: 10000 + (5 * 60)
    });
}

async function getSnapshotHtml(mirrorUrl) {
    const browser = await puppeteer.connect({browserWSEndpoint});
    const page = await browser.newPage();
    try {
        await page.goto(mirrorUrl, {waitUntil: 'networkidle0', 'timeout': 60000});
        const html = await page.content();
        return html;
    } catch (error) {
        throw error;
    } finally{
        page.close();
    }
}

async function takeSnapshotVersion(mirrorUrl) {
    const fileName = mirrorUrl.replace('http://', '').replace('https://', '') + '.html';
    try{
        const exist = await isFileExists(fileName);
        if(exist)
            return getFile(fileName);

        const html = await getSnapshotHtml(mirrorUrl);
        await s3.upload({
            Bucket: process.env.SNAPSHOT_BUCKET_NAME,
            Key: fileName,
            Body: Buffer.from(html),
            ACL:'public-read'
        }).promise();

       const fileUrl = getFile(fileName); 
       return fileUrl;
    } catch(e) {
        console.error(e);
        return null;
    } 
}

function isStaticRequest(url) {
    // Proxy server doesn't have any static files. So it shouldn't be dealing with that...
    const staticFileRegex = /\.(css|js|jpg|png|toff|svg|map|json|hdr|svg|ico|txt)$/i;
    const staticPaths = [
        '/static/',
        '/assets/',
        '/public/',
    ];

    return staticFileRegex.test(url) || staticPaths.some(p => url.includes(p));
}

app.use((req,res,next) => {
    const userAgent = req.get('User-Agent') || '';
    req.fromUrl = req.url;
    req.toUrl = TARGET_URL + req.originalUrl;
    req.isComingFromBot = (isbot(userAgent) || userAgent.includes('facebookexternalhit'));
    req.isStaticFileRequest = isStaticRequest(req.toUrl);
    req.shouldTakeSnapshot = req.isComingFromBot && !req.isStaticRequest; 

    next();
});

app.get('/*', async (req,res) => {

    if (!browserWSEndpoint) {
        const browser = await puppeteer.launch({headless: false});
        browserWSEndpoint = browser.wsEndpoint();
    }

    if(!req.shouldTakeSnapshot)
        return request(req.toUrl).pipe(res);

    const snapshotUrl = await takeSnapshotVersion(req.toUrl);
    if(!snapshotUrl)
        return request(req.toUrl).pipe(res);
    else {
        return request(snapshotUrl, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                res.set('Content-Type', 'text/html');
                return res.send(body);
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`Example app listening at ${PORT}`);
});