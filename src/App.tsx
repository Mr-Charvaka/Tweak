import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2, Brush, Eraser,
  Droplet, Play, Pause, ChevronRight,
  ChevronLeft, Pencil, Crop,
  Eye, EyeOff, Plus, Type, Trash2, Maximize, Undo2, Redo2,
  Lock, Unlock, Download, SlidersHorizontal
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './index.css';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: any;
  alphaLock: boolean;
}

interface FrameData {
  id: string;
  layerImages: Record<string, string>; // Layer ID -> Base64 Image
}

function VerticalSlider({ value, onChange, min, max, height, label }: { value: number, onChange: (v: number) => void, min: number, max: number, height: number, label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let clientY;
    if ('touches' in e) clientY = e.touches[0].clientY;
    else clientY = (e as MouseEvent | React.MouseEvent).clientY;

    let y = clientY - rect.top;
    let percentage = 1 - (y / rect.height);
    percentage = Math.max(0, Math.min(1, percentage));
    onChange(min + percentage * (max - min));
  };

  return (
    <div
      ref={containerRef}
      style={{ width: '26px', height: `${height}px`, background: 'rgba(0,0,0,0.5)', borderRadius: '13px', position: 'relative', cursor: 'ns-resize', border: '1px solid rgba(255,255,255,0.05)' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handleMove(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) handleMove(e);
      }}
      title={label}
    >
      <div
        style={{
          position: 'absolute',
          bottom: `${((value - min) / (max - min)) * 100}%`,
          left: '3px', right: '3px',
          height: '14px',
          background: '#e0e0e0',
          borderRadius: '7px',
          transform: 'translateY(50%)',
          pointerEvents: 'none',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
        }}
      />
    </div>
  )
}


function App() {
  const [activeTool, setActiveTool] = useState('brush');

  // Custom tool properties configured by Hovering Sidebar
  const [toolSize, setToolSize] = useState(12);
  const [toolOpacity, setToolOpacity] = useState(100);
  const [toolColor, setToolColor] = useState('#ff2d55');

  const [layers, setLayers] = useState<Layer[]>([
    { id: 'layer-3', name: 'Inks', visible: true, opacity: 100, blendMode: 'normal', alphaLock: false },
    { id: 'layer-2', name: 'Sketch', visible: true, opacity: 50, blendMode: 'multiply', alphaLock: false },
    { id: 'layer-1', name: 'Background', visible: true, opacity: 100, blendMode: 'normal', alphaLock: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState('layer-3');

  const [frames, setFrames] = useState<FrameData[]>([
    { id: uuidv4(), layerImages: {} }
  ]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [textInput, setTextInput] = useState<{ x: number, y: number, value: string, fontSize: number } | null>(null);

  // Undo / Redo Stacks (storing the entire frames array as a JSON string or simplified structure)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Rendering & Interaction state
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  const canvasWidth = 1280;
  const canvasHeight = 720;
  const playTimer = useRef<number | null>(null);

  const saveHistoryState = useCallback(() => {
    const storeObj: Record<string, string> = {};
    layers.forEach(l => {
      const cvs = canvasRefs.current[l.id];
      if (cvs) storeObj[l.id] = cvs.toDataURL();
    });

    const currentFrames = [...frames];
    currentFrames[activeFrameIndex] = { ...currentFrames[activeFrameIndex], layerImages: storeObj };

    const snapshot = JSON.stringify(currentFrames);

    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(snapshot);
      // keep limit to 20 for memory
      if (next.length > 20) next.shift();
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 19));
  }, [frames, layers, activeFrameIndex, historyIndex]);

  const restoreHistory = (index: number) => {
    if (index < 0 || index >= history.length) return;
    try {
      const payload: FrameData[] = JSON.parse(history[index]);
      setFrames(payload);

      // Fast render the new state onto canvases
      const frame = payload[activeFrameIndex];
      if (frame) {
        layers.forEach(l => {
          const cvs = canvasRefs.current[l.id];
          const ctx = cvs?.getContext('2d');
          if (ctx && cvs) {
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            if (frame.layerImages[l.id]) {
              const img = new Image();
              img.onload = () => ctx.drawImage(img, 0, 0);
              img.src = frame.layerImages[l.id];
            }
          }
        });
      }
      setHistoryIndex(index);
    } catch (e) { console.error(e); }
  };

  const setContextDefaults = (ctx: CanvasRenderingContext2D, tool: string) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Check Alpha Lock
    const targetLayer = layers.find(l => l.id === activeLayerId);
    const locked = targetLayer?.alphaLock;

    const r = parseInt(toolColor.slice(1, 3), 16) || 255;
    const g = parseInt(toolColor.slice(3, 5), 16) || 45;
    const b = parseInt(toolColor.slice(5, 7), 16) || 85;
    let rgbaStr = `rgba(${r}, ${g}, ${b}, ${toolOpacity / 100})`;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = locked ? 'source-atop' : 'destination-out';
      ctx.lineWidth = Math.max(2, toolSize * 2);
      // If locked, erasing should theoretically paint with transparent pixels, 
      // but standard standard destination-out doesn't work well with lock.
      // So if locked, we don't erase (or we paint 0 alpha)
      ctx.strokeStyle = `rgba(0,0,0,${locked ? 0 : (toolOpacity / 100)})`;
    } else if (tool === 'pencil') {
      ctx.globalCompositeOperation = locked ? 'source-atop' : 'source-over';
      ctx.lineWidth = Math.max(1, toolSize / 3);
      ctx.strokeStyle = rgbaStr;
    } else {
      ctx.globalCompositeOperation = locked ? 'source-atop' : 'source-over';
      ctx.lineWidth = toolSize;
      ctx.strokeStyle = rgbaStr;
    }
  };

  const switchFrame = useCallback((newIndex: number) => {
    const storeObj: Record<string, string> = {};
    layers.forEach(l => {
      const cvs = canvasRefs.current[l.id];
      if (cvs) storeObj[l.id] = cvs.toDataURL();
    });

    setFrames(prev => {
      const copy = [...prev];
      copy[activeFrameIndex] = { ...copy[activeFrameIndex], layerImages: storeObj };
      return copy;
    });

    const newFrame = frames[newIndex];
    if (newFrame) {
      layers.forEach(l => {
        const cvs = canvasRefs.current[l.id];
        if (cvs) {
          const ctx = cvs.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            const sourceUrl = newFrame.layerImages?.[l.id];

            if (sourceUrl) {
              const img = new Image();
              img.onload = () => ctx.drawImage(img, 0, 0);
              img.src = sourceUrl;
            } else if (l.name === 'Background') {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
          }
        }
      });
    }

    setActiveFrameIndex(newIndex);
  }, [layers, activeFrameIndex, frames]);

  useEffect(() => {
    if (isPlaying) {
      playTimer.current = window.setInterval(() => {
        let nextIndex = activeFrameIndex + 1;
        if (nextIndex >= frames.length) nextIndex = 0;
        switchFrame(nextIndex);
      }, 1000 / 12);
    } else {
      if (playTimer.current) clearInterval(playTimer.current);
    }
    return () => { if (playTimer.current) clearInterval(playTimer.current); }
  }, [isPlaying, activeFrameIndex, frames, switchFrame]);

  useEffect(() => {
    if (frames.length === 1 && Object.keys(frames[0].layerImages).length === 0) {
      layers.forEach(l => {
        if (l.name === 'Background') {
          const cvs = canvasRefs.current[l.id];
          if (cvs) {
            const ctx = cvs.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
          }
        }
      });
      // push initial history
      saveHistoryState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent, rect: DOMRect) => {
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  };

  const stampText = () => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const cvs = canvasRefs.current[activeLayerId];
    if (cvs) {
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `bold ${textInput.fontSize}px Inter`;

        const r = parseInt(toolColor.slice(1, 3), 16) || 255;
        const g = parseInt(toolColor.slice(3, 5), 16) || 45;
        const b = parseInt(toolColor.slice(5, 7), 16) || 85;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${toolOpacity / 100})`;

        ctx.textBaseline = 'top';
        ctx.fillText(textInput.value, textInput.x + 2, textInput.y + 2);
        saveHistoryState();
      }
    }
    setTextInput(null);
  };

  const applyBlur = () => {
    const cvs = canvasRefs.current[activeLayerId];
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const data = cvs.toDataURL();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = `blur(${Math.max(2, toolSize / 2)}px)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      saveHistoryState();
    };
    img.src = data;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const isMiddleClick = 'button' in e && e.button === 1;

    if (textInput && activeTool !== 'text') stampText();

    if (activeTool === 'select' || isMiddleClick) {
      let clientX, clientY;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      setIsDrawing(false);
      setPanOrigin({ x: clientX - pan.x, y: clientY - pan.y });
      return;
    }

    if (isPlaying) setIsPlaying(false);

    if (activeTool === 'blur') {
      applyBlur();
      setActiveTool('brush'); // switch back after action
      return;
    }

    if (activeTool === 'crop') {
      const cvs = canvasRefs.current[activeLayerId];
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          saveHistoryState();
        }
      }
      return;
    }

    if (activeTool === 'text') {
      if (textInput) stampText();
      const cvs = canvasRefs.current[activeLayerId];
      if (cvs) {
        const rect = cvs.getBoundingClientRect();
        const p = getCanvasPoint(e, rect);
        setTextInput({ x: p.x, y: p.y, value: '', fontSize: Math.max(16, toolSize * 4) });
      }
      return;
    }

    const targetLayer = layers.find(l => l.id === activeLayerId);
    if (!targetLayer || !targetLayer.visible) return;

    const cvs = canvasRefs.current[activeLayerId];
    if (!cvs) return;

    const rect = cvs.getBoundingClientRect();
    const point = getCanvasPoint(e, rect);

    setIsDrawing(true);
    setLastPos(point);

    if (activeTool === 'smudge') return;

    const ctx = cvs.getContext('2d');
    if (ctx) {
      setContextDefaults(ctx, activeTool);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + 0.1, point.y + 0.1);
      ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const isMiddleClick = 'buttons' in e && e.buttons === 4;
    if ((activeTool === 'select' && ('buttons' in e && e.buttons === 1)) || isMiddleClick || ('touches' in e && e.touches.length > 1)) {
      let clientX, clientY;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      setPan({
        x: clientX - panOrigin.x,
        y: clientY - panOrigin.y
      });
      return;
    }

    if (!isDrawing) return;

    const cvs = canvasRefs.current[activeLayerId];
    if (!cvs) return;

    const rect = cvs.getBoundingClientRect();
    const point = getCanvasPoint(e, rect);
    const ctx = cvs.getContext('2d');

    if (ctx) {
      if (activeTool === 'smudge') {
        const radius = Math.max(2, toolSize);
        ctx.globalAlpha = (toolOpacity / 100) * 0.4;
        // check lock
        const locked = layers.find(l => l.id === activeLayerId)?.alphaLock;
        ctx.globalCompositeOperation = locked ? 'source-atop' : 'source-over';

        ctx.drawImage(
          cvs,
          lastPos.x - radius * 2, lastPos.y - radius * 2, radius * 4, radius * 4,
          point.x - radius * 2, point.y - radius * 2, radius * 4, radius * 4
        );

        ctx.globalAlpha = 1.0;
      } else {
        setContextDefaults(ctx, activeTool);
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      setLastPos(point);
    }
  };

  const handlePointerUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistoryState();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const zoomIntensity = 0.05;
      const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
      setScale(Math.max(0.1, Math.min(scale * zoomFactor, 5)));
    } else {
      setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const addNewFrame = () => {
    const storeObj: Record<string, string> = {};
    layers.forEach(l => {
      const cvs = canvasRefs.current[l.id];
      if (cvs) storeObj[l.id] = cvs.toDataURL();
    });

    setFrames(prev => {
      let f = [...prev];
      f[activeFrameIndex] = { ...f[activeFrameIndex], layerImages: storeObj };
      return f;
    });

    const freshImageRefs: Record<string, string> = {};
    const bgUrl = storeObj[layers.find(l => l.name === 'Background')?.id || ''];
    if (bgUrl) freshImageRefs[layers.find(l => l.name === 'Background')!.id] = bgUrl;

    const newIndex = frames.length;
    setFrames(prev => [...prev, { id: uuidv4(), layerImages: freshImageRefs }]);
    switchFrame(newIndex);
  };

  const addNewLayer = () => {
    const id = `layer-${uuidv4()}`;
    setLayers(prev => [{ id, name: `Layer ${prev.length + 1}`, visible: true, opacity: 100, blendMode: 'normal', alphaLock: false }, ...prev]);
    setActiveLayerId(id);
  };

  const removeLayer = (id: string) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(layers[0].id);
  };

  // Full native ZIP Export implementation!
  const exportProject = async () => {
    const zip = new JSZip();
    zip.file("project.meta.json", JSON.stringify({ version: "1.0", layers: layers.map(l => ({ name: l.name, opacity: l.opacity, blend: l.blendMode })) }));

    // Convert active visual canvas tree to single PNG snapshot
    const flattened = document.createElement("canvas");
    flattened.width = canvasWidth;
    flattened.height = canvasHeight;
    const flatCtx = flattened.getContext('2d');

    if (flatCtx) {
      // composite backward, bottoms up
      const reversed = [...layers].reverse();
      for (const l of reversed) {
        if (!l.visible) continue;
        const cvs = canvasRefs.current[l.id];
        if (cvs) {
          flatCtx.globalAlpha = l.opacity / 100;
          flatCtx.globalCompositeOperation = l.blendMode || 'source-over';
          flatCtx.drawImage(cvs, 0, 0);
        }
      }

      const blob = await new Promise<Blob | null>(res => flattened.toBlob(res));
      if (blob) zip.file("Export_Result.png", blob);
    }

    // Export raw frames data directly
    const framesFolder = zip.folder("Frames");
    for (let i = 0; i < frames.length; i++) {
      // Just writing raw dataUrls as text, normally we'd write to actual PNG blobs per frame per layer
      // But for robust zipper, we'll write base64 raw to text for importing structure
      framesFolder?.file(`frame_${i}.json`, JSON.stringify(frames[i]));
    }

    zip.generateAsync({ type: "blob" }).then(function (content) {
      saveAs(content, "Tweak_Project_Export.zip");
    });
  };

  return (
    <div className="app-container">
      {/* Left Base Toolbar */}
      <motion.div
        className="toolbar"
        initial={{ x: -100 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="logo-area" style={{ marginBottom: '20px' }}>
          <motion.div whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}>
            <Brush className="logo-icon" size={28} />
          </motion.div>
        </div>

        <ToolButton icon={<MousePointer2 />} id="select" active={activeTool} set={setActiveTool} title="Pan/Move (Hold Middle Mouse)" />
        <ToolButton icon={<Brush />} id="brush" active={activeTool} set={setActiveTool} title="Soft Brush" />
        <ToolButton icon={<Pencil />} id="pencil" active={activeTool} set={setActiveTool} title="Pencil" />
        <ToolButton icon={<Eraser />} id="eraser" active={activeTool} set={setActiveTool} title="Eraser" />
        <ToolButton icon={<Droplet />} id="smudge" active={activeTool} set={setActiveTool} title="Smudge Canvas" />
        <ToolButton icon={<Type />} id="text" active={activeTool} set={setActiveTool} title="Text (Click on Canvas)" />
        <ToolButton icon={<SlidersHorizontal />} id="blur" active={activeTool} set={setActiveTool} title="Apply Filter (Gaussian Blur)" />
        <ToolButton icon={<Crop />} id="crop" active={activeTool} set={setActiveTool} title="Clear Active Layer" />

        <div style={{ flex: 1 }} />

        <div className="color-btn" style={{ marginBottom: '16px', backgroundColor: toolColor }}>
          <input type="color" value={toolColor} onChange={(e) => setToolColor(e.target.value)} />
        </div>

        <button className="btn-icon" style={{ marginBottom: '20px' }} onClick={() => { setPan({ x: 0, y: 0 }); setScale(1); }}>
          <Maximize size={22} />
        </button>
      </motion.div>

      {/* Main Column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Menu */}
        <motion.div className="top-menu" initial={{ y: -50 }} animate={{ y: 0 }}>
          <div className="logo-area">
            Tweak<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>v1.3.0</span>
          </div>
          <div className="top-right">
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{activeFrameIndex + 1} / {frames.length}Frames</span>
            <button className="styled-btn" onClick={exportProject} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Download size={14} /> Export ZIP
            </button>
          </div>
        </motion.div>

        {/* Canvas Area */}
        <div
          className="canvas-area"
          onWheel={handleWheel}
          style={{ touchAction: 'none' }}
        >
          {/* Procreate-like Scroller Sidebar */}
          <div className="procreate-sidebar">
            <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, marginTop: '-10px' }}>Size</div>
            <VerticalSlider min={1} max={100} value={toolSize} onChange={setToolSize} height={120} label="Brush Size" />

            <div className="color-btn" style={{ backgroundColor: toolColor }}>
              <input type="color" value={toolColor} onChange={(e) => setToolColor(e.target.value)} title="Color Picker" />
            </div>

            <VerticalSlider min={1} max={100} value={toolOpacity} onChange={setToolOpacity} height={120} label="Brush Opacity" />
            <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, marginBottom: '-4px' }}>Opac</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <button className="btn-icon" onClick={() => restoreHistory(historyIndex - 1)} disabled={historyIndex <= 0} style={{ opacity: historyIndex <= 0 ? 0.3 : 1 }}>
                <Undo2 size={18} />
              </button>
              <button className="btn-icon" onClick={() => restoreHistory(historyIndex + 1)} disabled={historyIndex >= history.length - 1} style={{ opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>
                <Redo2 size={18} />
              </button>
            </div>
          </div>

          {/* Transforming Workspace Container */}
          <div
            style={{
              position: 'relative', width: canvasWidth, height: canvasHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'top left',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Canvas Layers */}
            {[...layers].reverse().map((layer) => (
              <canvas
                key={layer.id}
                ref={(el) => { canvasRefs.current[layer.id] = el; }}
                width={canvasWidth}
                height={canvasHeight}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  opacity: layer.visible ? layer.opacity / 100 : 0,
                  mixBlendMode: layer.blendMode,
                  pointerEvents: 'none',
                  borderRadius: '4px',
                  backgroundColor: layer.id === layers[layers.length - 1].id ? 'transparent' : 'transparent',
                }}
              />
            ))}

            {/* Event Catcher Layer */}
            <div
              style={{
                position: 'absolute', top: 0, left: 0,
                width: canvasWidth, height: canvasHeight,
                cursor: activeTool === 'select' ? 'grab' : (activeTool === 'text' ? 'text' : 'crosshair')
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />

            {textInput && (
              <div
                style={{ position: 'absolute', top: textInput.y, left: textInput.x, display: 'flex', flexDirection: 'column', zIndex: 100 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={textInput.value}
                  onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') stampText();
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  placeholder="Type here..."
                  style={{
                    background: 'transparent',
                    border: `1px dashed ${toolColor}`,
                    color: toolColor,
                    font: `bold ${textInput.fontSize}px Inter`,
                    outline: 'none',
                    padding: '0 2px',
                    margin: 0,
                    minWidth: '150px'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', background: 'var(--panel-bg)', padding: '6px', borderRadius: '8px', border: '1px solid var(--panel-border)', width: 'fit-content' }}>
                  <button className="btn-icon" onClick={() => setTextInput({ ...textInput, fontSize: Math.max(12, textInput.fontSize - 4) })}>-</button>
                  <span style={{ color: 'white', display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 600, minWidth: '40px', justifyContent: 'center' }}>{textInput.fontSize}px</span>
                  <button className="btn-icon" onClick={() => setTextInput({ ...textInput, fontSize: textInput.fontSize + 4 })}>+</button>
                  <div style={{ width: '1px', background: 'var(--panel-border)', margin: '0 4px' }} />
                  <button className="styled-btn" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={stampText}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline / Flipbook */}
        <motion.div className="timeline-panel" initial={{ y: 150 }} animate={{ y: 0 }} transition={{ delay: 0.1 }}>
          <div className="timeline-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn-icon" onClick={() => {
                let target = activeFrameIndex - 1;
                if (target < 0) target = frames.length - 1;
                switchFrame(target);
              }}><ChevronLeft size={16} /></button>
              <button className="btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="btn-icon" onClick={() => {
                let target = activeFrameIndex + 1;
                if (target >= frames.length) target = 0;
                switchFrame(target);
              }}><ChevronRight size={16} /></button>
              <span style={{ marginLeft: '12px', fontFamily: 'monospace' }}>12 fps</span>
            </div>
            <div>
              <button className="styled-btn" style={{ padding: '4px 12px' }} onClick={addNewFrame}><Plus size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Frame</button>
            </div>
          </div>
          <div className="timeline-frames">
            {frames.map((f, i) => (
              <div
                key={f.id}
                className={`frame-item ${activeFrameIndex === i ? 'active' : ''}`}
                onClick={() => switchFrame(i)}
              >
                <div style={{ width: '100%', height: '100%', backgroundImage: `url(${f.layerImages[layers[0]?.id] || ''})`, backgroundSize: 'cover' }}></div>
                <span className="frame-number">{i + 1}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right Layers Panel */}
      <motion.div className="layers-panel" initial={{ x: 300 }} animate={{ x: 0 }}>
        <div className="panel-header">
          Layers Stack
          <button className="btn-icon" onClick={addNewLayer}><Plus size={18} /></button>
        </div>
        <div className="layer-list" style={{ flex: 'none', height: '40%', overflowY: 'auto' }}>
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`layer-item ${activeLayerId === layer.id ? 'active' : ''}`}
              onClick={() => setActiveLayerId(layer.id)}
            >
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setLayers(layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l))
                }}
              >
                {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: '8px' }}>
                <span className="layer-name">{layer.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{layer.blendMode}</span>
              </div>

              <button
                className={`btn-icon ${layer.alphaLock ? 'active-lock' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setLayers(layers.map(l => l.id === layer.id ? { ...l, alphaLock: !l.alphaLock } : l));
                }}
                title="Alpha Lock"
                style={{ color: layer.alphaLock ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {layer.alphaLock ? <Lock size={14} /> : <Unlock size={14} />}
              </button>

              <button className="btn-icon" onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--panel-border)', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Blend Mode</div>
          <select
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '6px', marginBottom: '16px' }}
            value={layers.find(l => l.id === activeLayerId)?.blendMode}
            onChange={(e) => setLayers(layers.map(l => l.id === activeLayerId ? { ...l, blendMode: e.target.value } : l))}
          >
            {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(m => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Opacity</div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>Value</span>
              <span>{layers.find(l => l.id === activeLayerId)?.opacity}%</span>
            </div>
            <input
              type="range" min="0" max="100"
              value={layers.find(l => l.id === activeLayerId)?.opacity || 0}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setLayers(layers.map(l => l.id === activeLayerId ? { ...l, opacity: val } : l));
              }}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Subcomponent for Toolbar buttons
function ToolButton({ icon, id, active, set, title }: { icon: React.ReactNode, id: string, active: string, set: (id: string) => void, title?: string }) {
  return (
    <button
      className={`tool-btn ${active === id ? 'active' : ''}`}
      onClick={() => set(id)}
      title={title}
    >
      {icon}
    </button>
  );
}

export default App;
