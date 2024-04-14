"use client";
import React, { } from 'react';

export default function Home() {
  
  return (
    <main className="flex min-h-screen items-center">
      <div className="endpoints-header">
        There is 5 different endpoints:
      </div>
       <ul className="endpoints-list">
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
    </main>
  );
}
