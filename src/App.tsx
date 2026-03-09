import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2, Brush, Eraser,
  Wand2, Settings, Play, Pause, ChevronRight,
  ChevronLeft, Pencil, PenTool, Crop,
  Eye, EyeOff, Plus, Type
} from 'lucide-react';
import './index.css';

function App() {
  const [activeTool, setActiveTool] = useState('brush');
  const [layers, setLayers] = useState([
    { id: 1, name: 'Background', visible: true, active: false },
    { id: 2, name: 'Sketch', visible: true, active: false },
    { id: 3, name: 'Inks', visible: true, active: true },
    { id: 4, name: 'Colors', visible: true, active: false }
  ]);
  const [frames] = useState([1, 2, 3, 4, 5, 6]);
  const [activeFrame, setActiveFrame] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Canvas Drawing logic mockup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set background to white (as an initial layer)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const finishDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.beginPath();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Handle touch & mouse coords
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = activeTool === 'eraser' ? 20 : 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = activeTool === 'eraser' ? '#ffffff' : (activeTool === 'brush' ? '#ff2d55' : '#000000');

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  return (
    <div className="app-container">
      {/* Left Toolbar */}
      <motion.div
        className="toolbar"
        initial={{ x: -100 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="logo-area" style={{ marginBottom: '20px' }}>
          <motion.div
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            <Brush className="logo-icon" size={28} />
          </motion.div>
        </div>

        <ToolButton icon={<MousePointer2 />} id="select" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Brush />} id="brush" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Pencil />} id="pencil" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Eraser />} id="eraser" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<PenTool />} id="rig" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Wand2 />} id="magic" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Type />} id="text" active={activeTool} set={setActiveTool} />
        <ToolButton icon={<Crop />} id="crop" active={activeTool} set={setActiveTool} />

        <div style={{ flex: 1 }} />
        <button className="btn-icon" style={{ marginBottom: '20px' }}>
          <Settings size={22} />
        </button>
      </motion.div>

      {/* Main Column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Menu */}
        <motion.div
          className="top-menu"
          initial={{ y: -50 }}
          animate={{ y: 0 }}
        >
          <div className="logo-area">
            Tweak
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
              v1.0.0
            </span>
          </div>
          <div className="top-right">
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Project: Untitled Animation</span>
            <button className="styled-btn">Export</button>
          </div>
        </motion.div>

        {/* Canvas Area */}
        <div className="canvas-area">
          <motion.canvas
            ref={canvasRef}
            className="drawing-canvas"
            width={1280}
            height={720}
            style={{ width: '80%', height: 'auto', aspectRatio: '16/9' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
            onMouseDown={startDrawing}
            onMouseUp={finishDrawing}
            onMouseOut={finishDrawing}
            onMouseMove={draw}
            onTouchStart={startDrawing}
            onTouchEnd={finishDrawing}
            onTouchMove={draw}
          />

          {/* AI Notice Hovering */}
          <div className="ai-panel">
            <div className="ai-pulse"></div>
            <span>AI Stylus tracking active (hand-motion ready).</span>
          </div>
        </div>

        {/* Timeline / Flipbook */}
        <motion.div
          className="timeline-panel"
          initial={{ y: 150 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
        >
          <div className="timeline-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn-icon"><ChevronLeft size={16} /></button>
              <button className="btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="btn-icon"><ChevronRight size={16} /></button>
              <span style={{ marginLeft: '12px', fontFamily: 'monospace' }}>24 fps</span>
            </div>
            <div>
              <button className="btn-icon"><Plus size={16} /> Add Frame</button>
            </div>
          </div>
          <div className="timeline-frames">
            {frames.map((f) => (
              <div
                key={f}
                className={`frame-item ${activeFrame === f ? 'active' : ''}`}
                onClick={() => setActiveFrame(f)}
              >
                <span className="frame-number">{f}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right Layers Panel */}
      <motion.div
        className="layers-panel"
        initial={{ x: 300 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="panel-header">
          Layers & Components
          <button className="btn-icon"><Plus size={18} /></button>
        </div>
        <div className="layer-list">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`layer-item ${layer.active ? 'active' : ''}`}
              onClick={() => {
                setLayers(layers.map(l => ({ ...l, active: l.id === layer.id })))
              }}
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
              <div className="layer-thumb"></div>
              <span className="layer-name">{layer.name}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Properties</div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>Opacity</span>
              <span>100%</span>
            </div>
            <input type="range" min="0" max="100" defaultValue="100" style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', marginBottom: '8px' }}>
              <span>Blend Mode</span>
              <span style={{ color: 'var(--accent)' }}>Normal</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Subcomponent for Toolbar buttons
function ToolButton({ icon, id, active, set }: { icon: React.ReactNode, id: string, active: string, set: (id: string) => void }) {
  return (
    <button
      className={`tool-btn ${active === id ? 'active' : ''}`}
      onClick={() => set(id)}
      title={id.charAt(0).toUpperCase() + id.slice(1)}
    >
      {icon}
    </button>
  );
}

export default App;
