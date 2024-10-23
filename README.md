# Secure adaptive streaming (MSE, EME, ABR, DASH)
This repository is a web player application that:
- parses DASH manifest,
- implements MSE (Media Source Extensions) API to play fragmented/segmented content,
- implements adaptive bitrate (ABR),
- implements EME (Encrypted Media Extensions) API to derypt an encrypted content, 
- plays content using HTMLMediaElement `src` attribute.

It also provides instructions to create a fragmented content, adaptive bitrate content, and encrypted content.

Available endpoints:
- /bitrate - tests adaptive bitrate (ABR)
- /encrypted - tests Encrypted Media Extensions (EME)
- /fragmented-dash - tests Media Source Extensions and Dash manifest (MSE + Dash)
- /normal - tests normal playback by assigning a video file to the `src`
- /fragmented - tests normal playback by assigning a fragmented video to the `src`

## Prerequisites
1. [bento4](https://www.bento4.com/) - a tool that allows you to fragment the mp4 file, encrypt it and create DASH manifest.
2. [ffmpeg](https://ffmpeg.org/) - a tool that allow you to manipulate the mp4 file, change codecs, bitrates, etc.
3. Chrome browser.

### Optional
1. [mediainfo](https://mediaarea.net/en/MediaInfo/Download) - a tool that allows you to see details of a given mp4 file, i.e. duration, codecs, bitrate, etc.
2. [mlynoteka](https://mlynoteka.mlyn.org/mp4parser) - online website that parses mp4 file and shows its atoms in a tree structure.


## Getting Started

### Run the app 
Run `yarn` to install dependencies and start development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Prepare the content

1. First, create a `public` folder in the root repository.
2. Then, download [BigBuckBunny.mp4](http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4) and place it within the `/public` folder.
3. Depending on which endpoint you would like to test, do the following:

#### /normal
Nothing to do here. You should be able to watch the video already.

#### /fragmented
1. Open `/public` folder and fragment the [BigBuckBunny.mp4](http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4) file:
```
mp4fragment BigBuckBunny.mp4 BigBuckBunny_fragmented.mp4
```

That's it! You should be able to watch the video already.

#### /fragmented-dash
1. Go to `/public` folder.
2. Fragment the [BigBuckBunny.mp4](http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4) file:
```
mp4fragment BigBuckBunny.mp4 BigBuckBunny_fragmented.mp4
```
1. Create `output-fragmented` folder within the `/public` and open it:
```
cd public && mkdir output-fragmented && cd output-fragmented
```
1. Create DASH manifest:
```
mp4dash ../BigBuckBunny-fragmented.mp4
```

That's it! You should be able to watch the video already.

#### /bitrate
1. Go to `/public` folder.
2. Encode the [BigBuckBunny.mp4](http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4) file with different bitrates:
```
ffmpeg -i ../BigBuckBunny.mp4 -b:v 360k -b:a 64k -s 640x360 -keyint_min 48 -g 48 -sc_threshold 0 BigBuckBunny_360p.mp4
ffmpeg -i ../BigBuckBunny.mp4 -b:v 2000k -b:a 64k -s 2560x1440 -keyint_min 48 -g 48 -sc_threshold 0 BigBuckBunny_1440p.mp4
...
```
3. Fragment all files:
```
mp4fragment BigBuckBunny_360p.mp4 BigBuckBunny_360p-f.mp4
mp4fragment BigBuckBunny_1440p.mp4 BigBuckBunny_1440p-f.mp4
...
```
4. Create `output-bitrate` folder within the `/public` and open it:
```
cd public && mkdir output-bitrate && cd output-bitrate
```
5. Create DASH manifest:
```
mp4dash ../BigBuckBunny_360p-f.mp4 ../BigBuckBunny_1440p-f.mp4 ...
```

That's it! You should be able to watch the video already.

#### /encrypted
1. Go to `/public` folder.
2. Fragment the [BigBuckBunny.mp4](http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4) file:
```
mp4fragment BigBuckBunny.mp4 BigBuckBunny_fragmented.mp4
```
3. Create `output-encrypted` folder within the `/public` and open it:
```
cd public && mkdir output-encrypted && cd output-encrypted
```
4. Create DASH manifest and encrypted the content with a `$KEY`:
```
KEY="90351951686b5e1ba222439ecec1f12a:0a237b0752cbf1a827e2fecfb87479a2"

mp4dash --widevine-header provider:widevine_test#content_id:2a --encryption-key $KEY ../BigBuckBunny-fragmented.mp4
```

That's it! You should be able to watch the video already.

