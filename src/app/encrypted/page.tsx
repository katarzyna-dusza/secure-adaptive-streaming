"use client";
import React, { useEffect, useState, useRef } from 'react';
import { DashMPD } from '@liveinstantly/dash-mpd-parser';
import {Manifest} from '../types';

const SEGMENTS_LENGTH = 261;
const MEDIA_FILES_PREFIX = './output-encrypted/output/';

const browserConsoleLog = (text: string) => console.log('%c Browser sends: ', 'background: #4cc9f0; color: black', text);
const clientConsoleLog = (text: string) => console.log('%c Client sends: ', 'background: #fcf4a3; color: black', text);

export default function Home() {
  const manifest = useRef<Manifest>();
  const audioCodecs = useRef('');
  const videoCodecs = useRef('');
  const audioMimeType = useRef('');
  const videoMimeType = useRef('');
  const audioInitSegmentUrl = useRef('');
  const audioMediaSegmentUrl = useRef('');
  const videoInitSegmentUrl = useRef('');
  const videoMediaSegmentUrl = useRef('');

  const currentSegment = useRef(1);

  const [ready, setReady] = useState(false)

  useEffect(() => {
    const parseManifest = (manifest: Manifest) => {
      const videoAdaptationSet = manifest.MPD!.Period[0].AdaptationSet[0];
  
      const videoRepresentation = videoAdaptationSet.Representation;
      const videoSegmentTemplate = videoAdaptationSet.SegmentTemplate;
      const videoRepresentationId = videoRepresentation[0]['@id'];
      const videoRepresentationMimeType = videoAdaptationSet['@mimeType'];
      const videoRepresentationCodecs = videoRepresentation[0]['@codecs'];
      const initVideoSegementUrl = videoSegmentTemplate['@initialization'].replace('$RepresentationID$', videoRepresentationId);
      const mediaVideoSegementUrl = videoSegmentTemplate['@media'].replace('$RepresentationID$', videoRepresentationId);

      videoCodecs.current = videoRepresentationCodecs;
      videoMimeType.current = videoRepresentationMimeType;
      videoInitSegmentUrl.current = initVideoSegementUrl;
      videoMediaSegmentUrl.current = mediaVideoSegementUrl;
  
      const audioAdaptationSet = manifest.MPD!.Period[0].AdaptationSet[1];
      
      const audioRepresentation = audioAdaptationSet.Representation;
      const audioSegmentTemplate = audioAdaptationSet.SegmentTemplate;
      const audioRepresentationId = audioRepresentation[0]['@id'];
      const audioRepresentationCodecs = audioRepresentation[0]['@codecs'];
      const audioRepresentationMimeType = audioAdaptationSet['@mimeType'];
      const initAudioSegementUrl = audioSegmentTemplate['@initialization'].replace('$RepresentationID$', audioRepresentationId);
      const mediaAudioSegementUrl = audioSegmentTemplate['@media'].replace('$RepresentationID$', audioRepresentationId);
  
      audioCodecs.current = audioRepresentationCodecs;
      audioMimeType.current = audioRepresentationMimeType;
      audioInitSegmentUrl.current = initAudioSegementUrl;
      audioMediaSegmentUrl.current = mediaAudioSegementUrl;
      
      setReady(true);
    }

    async function fetchManifest() {
      const manifestUri = `${MEDIA_FILES_PREFIX}/stream.mpd`;
      const res = await fetch(manifestUri);
      const manifestText = await res.text();

      const mpd = new DashMPD();
      mpd.parse(manifestText);
      const parsedManifest = mpd.getJSON();

      manifest.current = parsedManifest;
      parseManifest(parsedManifest);
    }
    fetchManifest(); 
  }, []);

  const doc: Document = document as Document;
  const video = doc.querySelector('video') as HTMLVideoElement;

  const mediaSource = new MediaSource();

  mediaSource.addEventListener('sourceopen', onSourceOpen);

  if (video) {
    video.src = window.URL.createObjectURL(mediaSource);
  }

  async function onSourceOpen() {
    if (mediaSource.readyState !== 'open') {
      return;
    }

    if (mediaSource.sourceBuffers.length > 0) return;

    const sourceBufferVideo = mediaSource.addSourceBuffer(
      `${videoMimeType.current}; codecs="${videoCodecs.current}"`
    );
    const sourceBufferAudio = mediaSource.addSourceBuffer(
      `${audioMimeType.current}; codecs="${audioCodecs.current}"`
    );

    const firstAppendHandler = () => {
      sourceBufferVideo.removeEventListener('updateend', firstAppendHandler);
      sourceBufferAudio.removeEventListener('updateend', firstAppendHandler);

      appendNextMediaSegment();
    };

    video.addEventListener("encrypted", onEncrypted);
    video.addEventListener("play", () => {
      const event = new Event("progress");
      video.dispatchEvent(event);
    });
    video.addEventListener("progress", onProgress);
   
    try {
      const initSegment = await getInitializationSegment();

      if (initSegment == null) {
        mediaSource.endOfStream("network");
        return;
      }

      sourceBufferVideo.addEventListener('updateend', firstAppendHandler);

      sourceBufferVideo.appendBuffer(initSegment.video);
      sourceBufferAudio.appendBuffer(initSegment.audio);
    } catch (error) {
      console.error("Error fetching initialization segment:", error);
      if (mediaSource.readyState === 'open') {
        mediaSource.endOfStream("network");
      }
    }
  }

  async function appendNextMediaSegment() {
    if (
      mediaSource.readyState === "closed" ||
      mediaSource.sourceBuffers[0].updating
    )
      return;

    if (!hasMoreMediaSegments()) {
      if (mediaSource.readyState !== 'open') {
        mediaSource.endOfStream();
      }
      return;
    }

    try {
      const mediaSegment = await getNextMediaSegment();

      if (!mediaSegment) {
        if (mediaSource.readyState !== 'open') {
          mediaSource.endOfStream("network");
        }
        return;
      }

      mediaSource.sourceBuffers[0].appendBuffer(mediaSegment.video);
      mediaSource.sourceBuffers[1].appendBuffer(mediaSegment.audio);
    }
    catch (error) {
      console.error("Error fetching media segment:", error);
      if (mediaSource.readyState !== 'open') {
        mediaSource.endOfStream("network");
      }
    }
  }

  function onProgress() {
    if (!video.paused || currentSegment.current < 10) {
      appendNextMediaSegment();
    }
  } 

  let keySession: MediaKeySession;

  async function handleMessage(event: any) {
    browserConsoleLog('message (key needed)');
    clientConsoleLog('MediaKeySession.onmessage');

    try {
      clientConsoleLog('POST /get-license');
      const response = await fetch('https://cwip-shaka-proxy.appspot.com/no_auth', {
        method: "POST",
        body: event.message,
      });
      clientConsoleLog('POST /get-license -> licenseWithAKey received');
      const license = await response.arrayBuffer();
      clientConsoleLog('MediaKeySession.update(licenseWithAKey)');
      await keySession.update(license);
    } catch(error) {
      console.error('update() failed', error)
    }
  }

  async function generateRequest(mediaKeys: MediaKeys, initDataType: any, initData: any) {
    clientConsoleLog("MediaKeys.createSession('temporary') -> MediaKeySession");
    keySession = mediaKeys.createSession('temporary');
    keySession.addEventListener("message", handleMessage, false);

    try {
      clientConsoleLog('MediaKeySession.generateRequest(t, d)');
      await keySession.generateRequest(initDataType, initData);
    } catch(error) {
      console.error('Unable to create or initialize key session', error)
    }
  }

  async function createMediaKeySystemAccess() {
    const keySystemOptions = [{ 
      initDataTypes: ['cenc'],
      audioCapabilities: [
        { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' },
      ],
      videoCapabilities: [
        { contentType: 'video/mp4; codecs="avc1.64001F"', robustness: 'SW_SECURE_DECODE' },
      ]
    }];

    try {
      clientConsoleLog('requestMediaKeySystemAccess(k, c) -> MediaKeySystemAccess');
      return await navigator.requestMediaKeySystemAccess('com.widevine.alpha', keySystemOptions);
    } catch(error) {
      console.error('Unable to instantiate Widevine key system.', error)
    }
  }

  async function onEncrypted(event: any) {
    browserConsoleLog('encrypted(e)');

    const target = event.target;
    if (target.mediaKeysObject === undefined) {
      target.mediaKeysObject = null; // Prevent entering this path again.
      target.pendingSessionData = []; // Will store all initData until the MediaKeys is ready.

      try {
        const keySystemAccess = await createMediaKeySystemAccess();

        clientConsoleLog('MediaKeySystemAccess.createMediaKeys() -> MediaKeys');
        const mediaKeys = await keySystemAccess!.createMediaKeys();
        target.mediaKeysObject = mediaKeys;
  
        const certificate = await fetchCertificate();

        if (certificate) {
          mediaKeys.setServerCertificate(certificate);
        }
  
        for (let i = 0; i < target.pendingSessionData.length; i++) {
          const data = target.pendingSessionData[i];
          await generateRequest(target.mediaKeysObject, data.initDataType, data.initData);
        }
        target.pendingSessionData = [];
  
        clientConsoleLog('video.setMediaKeys(mediaKeys)');
        target.setMediaKeys(mediaKeys);

        if (target.mediaKeysObject) {
          await generateRequest(target.mediaKeysObject, event.initDataType, event.initData);
        } else {
          target.pendingSessionData.push({initDataType: event.initDataType, initData: event.initData});
        }

      } catch(error) {
        console.error('Failed to create and initialize a MediaKeys object', error)
      }
    }
  }

  async function fetchArrayBuffer(url: string) {  
    const response = await fetch(`${MEDIA_FILES_PREFIX}${url}`);
    return await response.arrayBuffer();
  };

  async function fetchCertificate() {  
    const response = await fetch('https://cwip-shaka-proxy.appspot.com/service-cert');
    return await response.arrayBuffer();
  };

  async function getInitializationSegment() {
    const videoArrayBuffer = await fetchArrayBuffer(videoInitSegmentUrl.current);
    const audioArrayBuffer = await fetchArrayBuffer(audioInitSegmentUrl.current);

    return {
      video: videoArrayBuffer,
      audio: audioArrayBuffer
    }; 
  }

  function hasMoreMediaSegments() {
    return SEGMENTS_LENGTH > currentSegment.current;
  }

  async function getNextMediaSegment() {
    const videoArrayBuffer = await fetchArrayBuffer(videoMediaSegmentUrl.current.replace('$Number$', currentSegment.current));
    const audioArrayBuffer = await fetchArrayBuffer(audioMediaSegmentUrl.current.replace('$Number$', currentSegment.current));
    
    currentSegment.current++;

    return {
      video: videoArrayBuffer,
      audio: audioArrayBuffer
    }; 
  }

  return (
    <main className="flex flex-col items-center justify-between">
      <h1>Fragmented, encrypted content with DASH manifest</h1>
      <ul className="endpoints-list-small">
        <li>
            <a className="endpoint" href="/bitrate">/bitrate </a><span className="endpoint-explanation">- tests adaptive bitrate (ABR)</span>
        </li>
        <li>
          <a className="endpoint" href="/encrypted">/encrypted </a><span className="endpoint-explanation">- tests encrypted media extensions (EME)</span>
        </li>
        <li>
          <a className="endpoint" href="/fragmented-dash">/fragmented-dash </a><span className="endpoint-explanation">- tests media source extensions and dash manifest (MSE + Dash)</span>
        </li>
        <li>
          <a className="endpoint" href="/normal">/normal </a><span className="endpoint-explanation">- tests normal playback by downloading whole video file and assigning it to the src</span>
        </li>
        <li>
          <a className="endpoint" href="/fragmented">/fragmented </a><span className="endpoint-explanation">- tests normal playback by downloading whole fragmented video file and assigning it to the src </span>
        </li>
       </ul>
      <div className="flex flex-col items-center justify-between">
        <video width="620" height="540" controls></video>
      </div>
    </main>
  );
}
