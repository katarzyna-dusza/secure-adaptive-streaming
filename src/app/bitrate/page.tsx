"use client";
import React, { useEffect, useState, useRef } from 'react';
import { DashMPD } from '@liveinstantly/dash-mpd-parser';
import {Representation, SegmentTemplate, AdaptationSet, Manifest} from '../types';

const SEGMENTS_LENGTH = 299;
const MEDIA_FILES_PREFIX = './output-bitrate/output/';

interface VideoInfo {
  representationId: string;
  codecs: string;
  initVideoUrl: string;
  mediaVideoUrl: string;
}

export default function Home() {
  const manifest = useRef<Manifest>();

  const videoAdaptationSet = useRef<AdaptationSet>();
  const videoRepresentation = useRef<Representation[]>();
  const videoSegmentTemplate = useRef<SegmentTemplate>();
  const videoMimeType = useRef('');

  const audioAdaptationSet = useRef<AdaptationSet>();
  const audioRepresentation = useRef<Representation[]>();
  const audioSegmentTemplate = useRef<SegmentTemplate>();
  const audioMimeType = useRef('');
  const audioRepresentationCodecs = useRef('');
  const audioInitSegmentUrl = useRef('');
  const audioMediaSegmentUrl = useRef('');
  const audioRepresentationId = useRef('');

  const currentSegment = useRef(1);
  const bandwidth = useRef(870287);
  const didBandwidthChange = useRef(false);

  const videoInfo = useRef<VideoInfo>();

  const [firstRender, reRender] = useState(true);
  
  const bandwidthDivMap = {
    'video/avc1/1': 'super-slow',
    'video/avc1/2': 'slow',
    'video/avc1/3': 'fine',
    'video/avc1/4': 'good',
    'video/avc1/5': 'very-good',
  };

  const adaptVideo = (newBandwidth: number) => {
    let videoId, videoCodecs, initVideoUrl, mediaVideoUrl;

    for (let i = 0; i < videoRepresentation.current!.length; i++) {
      if (videoRepresentation.current![i]['@bandwidth'] <= newBandwidth) {
        videoId = videoRepresentation.current![i]['@id'];
        videoCodecs = videoRepresentation.current![i]['@codecs'];
        initVideoUrl = videoSegmentTemplate.current!['@initialization'].replace('$RepresentationID$', videoId);
        mediaVideoUrl = videoSegmentTemplate.current!['@media'].replace('$RepresentationID$', videoId);
      } else {
        break;
      }
    }
    // if none selected, select the smallest
    if (!videoId) {
      videoId = videoRepresentation.current![0]['@id'];
      videoCodecs = videoRepresentation.current![0]['@codecs'];
      initVideoUrl = videoSegmentTemplate.current!['@initialization'].replace('$RepresentationID$', videoId);
      mediaVideoUrl = videoSegmentTemplate.current!['@media'].replace('$RepresentationID$', videoId);
    }


    bandwidth.current = newBandwidth;
    didBandwidthChange.current = true;
    videoInfo.current = {
      representationId: videoId || '',
      codecs: videoCodecs || '',
      initVideoUrl: initVideoUrl || '',
      mediaVideoUrl: mediaVideoUrl || '',
    }

    if (firstRender) {
      reRender(false);
    }
  };

  useEffect(() => {
    const parseManifest = (manifest: Manifest) => {
      const videoAdaptationSetManifest = manifest.MPD!.Period[0].AdaptationSet[0];
      videoAdaptationSet.current = videoAdaptationSetManifest as AdaptationSet;
      videoRepresentation.current = videoAdaptationSetManifest.Representation as Representation[];
      videoSegmentTemplate.current = videoAdaptationSetManifest.SegmentTemplate;
      videoMimeType.current = videoAdaptationSetManifest['@mimeType'];

      const audioAdaptationSetManifest = manifest.MPD!.Period[0].AdaptationSet[1];
      audioAdaptationSet.current = audioAdaptationSetManifest as AdaptationSet;
      audioRepresentation.current = audioAdaptationSetManifest.Representation as Representation[];
      audioSegmentTemplate.current = audioAdaptationSetManifest.SegmentTemplate;
      audioMimeType.current = audioAdaptationSetManifest['@mimeType'];

      // For audio there is no different bitrates
      const audioId = (audioAdaptationSetManifest.Representation as Representation[])[0]['@id'];
      audioRepresentationId.current = audioId;
      audioRepresentationCodecs.current = (audioAdaptationSetManifest.Representation as Representation[])[0]['@codecs'];

      audioInitSegmentUrl.current = audioAdaptationSetManifest.SegmentTemplate['@initialization'].replace('$RepresentationID$', audioId);
      audioMediaSegmentUrl.current = audioAdaptationSetManifest.SegmentTemplate['@media'].replace('$RepresentationID$', audioId);
    }

    async function fetchManifest() {
      const manifestUri = `${MEDIA_FILES_PREFIX}stream.mpd`;
      const res = await fetch(manifestUri);
      const manifestText = await res.text();

      const mpd = new DashMPD();
      mpd.parse(manifestText);
      const parsedManifest = mpd.getJSON();

      manifest.current = parsedManifest;
      parseManifest(parsedManifest);
      adaptVideo(bandwidth.current);
    }
    fetchManifest(); 
  }, []);

  const doc: Document = document as Document;
  const video = doc.querySelector('video') as HTMLVideoElement;

  if (!videoMimeType.current || !audioMimeType.current || !videoInfo.current || !audioRepresentationCodecs.current) {
    return;
  }

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
      `${videoMimeType.current}; codecs="${videoInfo.current?.codecs}"`
    );
    const sourceBufferAudio = mediaSource.addSourceBuffer(
      `${audioMimeType.current}; codecs="${audioRepresentationCodecs.current}"`
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

      if (didBandwidthChange.current) {
        const initSegment = await getInitializationSegment();
        // we append only video init segment again, because for audio we have the same bitrate
        mediaSource.sourceBuffers[0].appendBuffer(initSegment!.video);
        didBandwidthChange.current = false;
      }

      if (!mediaSource.sourceBuffers[0].updating) {
        mediaSource.sourceBuffers[0].appendBuffer(mediaSegment.video);
        mediaSource.sourceBuffers[1].appendBuffer(mediaSegment.audio);
        currentSegment.current++;
      }
      drawBits();
    } catch (error) {
      console.error("Error fetching media segment:", error);
      console.log(video.error)
      if (mediaSource.readyState !== 'open') {
        mediaSource.endOfStream("network");
      }
    }
  }

  function drawBits () {
    const divClassToAppend = bandwidthDivMap[videoInfo.current!.representationId as keyof typeof bandwidthDivMap];

    Object.values(bandwidthDivMap).forEach(function(divClass) {
      const addBit = document.createElement("div");
      addBit.classList.add(divClass === divClassToAppend ? 'single-bit' : 'single-bit-empty');
      document.getElementsByClassName(divClass)[0].appendChild(addBit);
    });
  }

  async function onProgress() {
    if (!video.paused || currentSegment.current < 10) {
      appendNextMediaSegment();
    }
  }

  async function fetchArrayBuffer(url: string) { 
    const response = await fetch(`${MEDIA_FILES_PREFIX}${url}`);
    return await response.arrayBuffer();
  };

  async function getInitializationSegment() {
    if (!videoInfo || !videoInfo.current?.initVideoUrl) return;

    const videoArrayBuffer = await fetchArrayBuffer(videoInfo.current!.initVideoUrl);
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
    if (!videoInfo || !videoInfo.current?.mediaVideoUrl) return;

    const videoArrayBuffer = await fetchArrayBuffer(videoInfo.current!.mediaVideoUrl.replace('$Number$', currentSegment.current));
    const audioArrayBuffer = await fetchArrayBuffer(audioMediaSegmentUrl.current.replace('$Number$', currentSegment.current));
    
    // currentSegment.current++;
    
    return {
      video: videoArrayBuffer,
      audio: audioArrayBuffer
    }; 
  }
  function handleChange() {
    const bitratesList = document.getElementById("bitrates");
    adaptVideo(Number(bitratesList.options[bitratesList.selectedIndex].text));
  }

  return (
    <main>
      <div className="flex flex-col items-center justify-between">
        <h1>Adaptive Bitrate (ABR)</h1>
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
      </div>
      <select id="bitrates" onChange={handleChange} >
        <option> Select bitrate </option>
        <option> 870287 </option>
        <option> 1135704 </option>
        <option> 2531909 </option>
        <option> 3366070 </option>
        <option> 5084302 </option>
      </select>
      <h1>Bitrates:</h1>
      <div className="bitrate-header">Super slow (0 - 400)</div>
      <div className="bits flex super-slow">
      </div>
      <div className="bitrate-header">Slow (400 - 700)</div>
      <div className="bits flex slow">
      </div>
      <div className="bitrate-header">Fine (700 - 1200)</div>
      <div className="bits flex fine">
      </div>
      <div className="bitrate-header">Good (1200 - 2100)</div>
      <div className="bits flex good">
      </div>
      <div className="bitrate-header">Very good (2100 - Infinity)</div>
      <div className="bits flex very-good">
      </div>
    </main>
  );
}
