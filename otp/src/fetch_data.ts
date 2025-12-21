import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import * as dotenv from 'dotenv';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const SUBSCRIPTION_KEY = process.env.HSL_API_KEY;
const BASE_URL = 'https://api.digitransit.fi/routing-data/v3/hsl/';
const URL = `${BASE_URL}?digitransit-subscription-key=${SUBSCRIPTION_KEY}`;

async function main() {
  if (!SUBSCRIPTION_KEY) {
    console.error('ERROR: HSL_API_KEY is not set in .env');
    process.exit(1);
  }

  try {
    console.log(`Fetching HSL routing data listing from: ${BASE_URL}`);
    const { data: html } = await axios.get(URL);

    // Find graph-hsl-*.zip link
    // Example: <a href="graph-hsl-8147ddbfb7cd43fd08dd8ff38547caac52d4d5dd.zip">graph-hsl-8147ddbfb7cd43fd08dd8ff38547caac52d4d5dd.zip</a>
    const match = html.match(/href="(graph-hsl-[a-f0-9]+\.zip)"/);
    if (!match) {
      console.error('Could not find graph-hsl-*.zip in the directory listing.');
      process.exit(1);
    }

    const zipFilename = match[1];
    const zipUrl = `${BASE_URL}${zipFilename}?digitransit-subscription-key=${SUBSCRIPTION_KEY}`;
    const zipPath = path.join(__dirname, '../', zipFilename);

    console.log(`Downloading ${zipFilename}...`);
    const response = await axios({
      url: zipUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    fs.writeFileSync(zipPath, response.data);
    console.log(`Downloaded to ${zipPath}`);

    console.log('Extracting /hsl folder...');
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    // The zip structure has a 'hsl/' directory
    // We want to extract 'hsl/' to the current directory (data/otp/)
    zip.extractEntryTo('hsl/', path.join(__dirname, '../'), true, true);

    console.log('Cleaning up zip file...');
    fs.unlinkSync(zipPath);

    console.log('Successfully fetched and extracted HSL data.');
  } catch (error) {
    console.error('Error fetching data:', error);
    process.exit(1);
  }
}

main();
