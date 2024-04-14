"use client";
import React, { } from 'react';

export default function Home() {
  
  return (
    <main className="flex flex-col items-center justify-between">
      <h1>Fragmented content - single file</h1>
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
       <video width="620" height="540" controls src="BigBuckBunny-fragmented.mp4"></video>
    </main>
  );
}
