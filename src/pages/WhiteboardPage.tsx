// src/pages/WhiteboardPage.tsx
import React from 'react';
import InteractiveWhiteboard from '@/components/InteractiveWhiteboard';

export default function WhiteboardPage() {
  return (
    <div className="w-full h-screen bg-slate-100 flex flex-col overflow-hidden">
      <InteractiveWhiteboard
        title="Bảng Vẽ Ô Ly Toán - Hóa Thầy Thọ"
        isModal={false}
      />
    </div>
  );
}
