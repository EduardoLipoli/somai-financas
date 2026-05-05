import React from 'react';

export default function Loading() {
  return (
    <div className="loading bg-black/50 fixed w-full h-full top-0 left-0 flex justify-center items-center z-[1000] backdrop-blur-sm">
      <div className="loader-circle w-[50px] h-[50px] rounded-full border-[10px] border-[#27272A] border-t-[#22c55e] animate-spin"></div>
    </div>
  );
}