"use client";
import React, { useEffect, useState, useRef } from 'react';
import { DashMPD } from '@liveinstantly/dash-mpd-parser';
import {Manifest} from '../types';

const SEGMENTS_LENGTH = 261;
const MEDIA_FILES_PREFIX = './output-fragmented/output/';

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

    video.addEventListener("progress", onProgress);
    video.addEventListener("play", () => {
      const event = new Event("progress");
      video.dispatchEvent(event);
    });

    try {
   
      const initSegment = await getInitializationSegment();

      if (initSegment == null) {// || mediaSource.readyState !== 'open') {
        mediaSource.endOfStream("network");
        return;
      }

      const firstAppendHandler = () => {
        sourceBufferVideo.removeEventListener('updateend', firstAppendHandler);
        sourceBufferAudio.removeEventListener('updateend', firstAppendHandler);

        appendNextMediaSegment();
      };

      sourceBufferVideo.addEventListener('updateend', firstAppendHandler);
      sourceBufferAudio.addEventListener('updateend', firstAppendHandler);

      sourceBufferVideo.appendBuffer(initSegment.video);
      sourceBufferAudio.appendBuffer(initSegment.audio);
    } catch (error) {
      console.error("Error fetching initialization segment:", error);
      if (mediaSource.readyState !== 'open') {
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

    if (!haveMoreMediaSegments()) {
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

  async function fetchArrayBuffer(url: string) {  
    const response = await fetch(`${MEDIA_FILES_PREFIX}${url}`);
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

  function haveMoreMediaSegments() {
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
      <h1>Fragmented content with DASH manifest</h1>
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
