import React from 'react';

import { ObserverData, SetProperty } from '../types';

// MCS Deck Viewer overlay — the minimal Marmoset-Viewer-style HUD for megacity.studio.
// Faithful port of the Claude Design prototype (design/deck-viewer.dc.html):
//   top-right title + icon column (logo / fullscreen / passes / help),
//   bottom animation bar (speed / play / scrub / clip menu), branded help modal,
//   and a material-passes inspection mode.
//
// Key difference from the prototype: the prototype hand-rolled orbit/zoom/light because it
// had no engine. Here the PlayCanvas viewer's own camera-controls own the canvas, so this
// overlay is pure chrome — the root is pointer-events:none and only the controls capture
// pointer events, letting drags fall through to the 3D viewport.
//
// State wiring:
//   - animation.{playing,speed,progress,selectedTrack,list} — the bottom bar (observer).
//   - debug.renderMode — the 11 material passes (observer; setShaderPass in viewer.ts).
//   - passesMode / expandedPass / help / menu / fullscreen — local UI state.
//
// PHASE B (marked below): the simultaneous diagonal-wipe (all 11 passes at once via
// scissored per-slice re-renders) lives in viewer.ts. Phase A renders one selected pass
// full-viewport with the diagonal pass-picker labels over it.

const SPEEDS = [0.5, 1, 1.5, 2];

// 11 render passes, in wipe order left→right. `mode` = the observer debug.renderMode value
// (see ObserverData['debug']['renderMode'] + viewer.ts setRenderMode → setShaderPass).
const PASS_DEFS: Array<{ name: string, mode: string }> = [
    { name: 'Default', mode: 'default' },
    { name: 'Lighting', mode: 'lighting' },
    { name: 'Albedo', mode: 'albedo' },
    { name: 'Emissive', mode: 'emission' },
    { name: 'WorldNormal', mode: 'worldNormal' },
    { name: 'Metalness', mode: 'metalness' },
    { name: 'Gloss', mode: 'gloss' },
    { name: 'Ao', mode: 'ao' },
    { name: 'Specularity', mode: 'specularity' },
    { name: 'Opacity', mode: 'opacity' },
    { name: 'Uv0', mode: 'uv0' }
];

// ---- shared style fragments (tokens from the MegaCity design system) ----
const GLASS: React.CSSProperties = {
    background: 'rgba(15,20,29,0.85)',
    border: '1px solid rgba(176,194,228,0.12)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)'
};
const MONO = '\'IBM Plex Mono\', monospace';

type Props = { observerData: ObserverData, setProperty: SetProperty };
type State = {
    passesMode: boolean,
    expandedPass: string | null,
    help: boolean,
    menu: boolean,
    fullscreen: boolean
};

class McsViewerOverlay extends React.Component<Props, State> {
    _onKey: (e: KeyboardEvent) => void;

    _onFs: () => void;

    constructor(props: Props) {
        super(props);
        this.state = { passesMode: false, expandedPass: null, help: false, menu: false, fullscreen: false };
    }

    componentDidMount(): void {
        this._onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.setState({ help: false, menu: false });
                if (this.state.passesMode) this.setPasses(false);
            }
            if (e.key === ' ' && !this.state.help) {
                e.preventDefault();
                this.togglePlay();
            }
        };
        this._onFs = () => this.setState({ fullscreen: !!document.fullscreenElement });
        window.addEventListener('keydown', this._onKey);
        document.addEventListener('fullscreenchange', this._onFs);
    }

    componentWillUnmount(): void {
        window.removeEventListener('keydown', this._onKey);
        document.removeEventListener('fullscreenchange', this._onFs);
    }

    // ---- animation wiring ----
    get anim() {
        return this.props.observerData.animation;
    }

    get animList(): string[] {
        try {
            return JSON.parse(this.anim.list || '[]');
        } catch (e) {
            return [];
        }
    }

    togglePlay = () => this.props.setProperty('animation.playing', !this.anim.playing);

    cycleSpeed = () => {
        const i = SPEEDS.indexOf(this.anim.speed);
        this.props.setProperty('animation.speed', SPEEDS[(i + 1) % SPEEDS.length]);
    };

    seek = (clientX: number, el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        this.props.setProperty('animation.playing', false);
        this.props.setProperty('animation.progress', t);
    };

    pickClip = (name: string) => {
        this.props.setProperty('animation.selectedTrack', name);
        this.props.setProperty('animation.progress', 0);
        this.setState({ menu: false });
    };

    // ---- passes wiring ----
    setPasses = (on: boolean) => {
        this.setState({ passesMode: on, expandedPass: on ? this.state.expandedPass : null });
        // Phase A: drive the real engine pass. Off → back to the default forward render.
        // (Our own stats readout is drawn in renderPasses — we don't flip on debug.stats,
        //  which would show PlayCanvas's ministats and clash with it.)
        this.props.setProperty('debug.renderMode', on ? (this.expandedMode() ?? 'default') : 'default');
    };

    expandedMode = (): string | null => {
        const p = PASS_DEFS.find(d => d.name === this.state.expandedPass);
        return p ? p.mode : null;
    };

    pickPass = (def: { name: string, mode: string }) => {
        const on = this.state.expandedPass === def.name;
        this.setState({ expandedPass: on ? null : def.name });
        // Phase A shows one pass full-viewport; Phase B renders all slices simultaneously.
        this.props.setProperty('debug.renderMode', on ? 'default' : def.mode);
    };

    toggleFullscreen = () => {
        try {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
        } catch (e) { /* embed may block fullscreen */ }
    };

    // ---- render ----
    render() {
        const scene = this.props.observerData.scene;
        const asset = (scene.filenames && scene.filenames[0]) ?
            scene.filenames[0].replace(/\.[^.]+$/, '') :
            '—';

        return (
            <div className="mcs-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: '\'Archivo\', sans-serif', color: '#e7ecf6' }}>
                {/* bottom scrim for control legibility (keeps the real render visible) */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', background: 'linear-gradient(to top, rgba(3,4,7,0.55), transparent)', pointerEvents: 'none' }} />

                {this.renderPasses()}
                {this.renderTopRight(asset)}
                {this.renderAnimBar()}
                {this.renderHelp()}
            </div>
        );
    }

    // top-right: title block + vertical icon column
    renderTopRight(asset: string) {
        const iconBtn: React.CSSProperties = {
            ...GLASS,
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            cursor: 'pointer',
            padding: 0,
            pointerEvents: 'auto'
        };
        return (
            <div style={{ position: 'absolute', top: 18, right: 18, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
                <div style={{ textAlign: 'right', pointerEvents: 'auto' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.02em' }}>{asset}</div>
                    <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: '#8a93a8' }}>
                        MCS DECK · <a href="https://megacity.studio" target="_blank" rel="noreferrer" className="mcs-link" style={{ color: '#d6a64b', textDecoration: 'none' }}>MEGACITY.STUDIO</a>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <a href="https://megacity.studio" target="_blank" rel="noreferrer" title="megacity.studio" className="mcs-icon-btn" style={iconBtn}>
                        <img src="static/mcs-logo.png" alt="MegaCity" style={{ width: 24, height: 24, display: 'block' }} />
                    </a>
                    <button onClick={this.toggleFullscreen} title="Fullscreen" className="mcs-icon-btn" style={iconBtn}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#e7ecf6" strokeWidth="1.5"><path d="M1 5 V1 H5" /><path d="M11 1 H15 V5" /><path d="M15 11 V15 H11" /><path d="M5 15 H1 V11" /></svg>
                    </button>
                    <button onClick={() => this.setPasses(!this.state.passesMode)} title="Material passes" className="mcs-icon-btn" style={{ ...iconBtn, position: 'relative' }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#e7ecf6" strokeWidth="1.5"><path d="M6 1 L1 6" /><path d="M11 1 L1 11" /><path d="M15 2 L2 15" /><path d="M15 7 L7 15" /><path d="M15 12 L12 15" /></svg>
                        {this.state.passesMode &&
                            <div style={{ position: 'absolute', inset: -1, border: '1px solid #d6a64b', borderRadius: 8, pointerEvents: 'none' }} />}
                    </button>
                    <button onClick={() => this.setState({ help: true })} title="Help" className="mcs-icon-btn" style={{ ...iconBtn, fontFamily: MONO, fontSize: 15, color: '#e7ecf6' }}>?</button>
                </div>
            </div>
        );
    }

    // bottom animation bar (hidden when the asset has no clips)
    renderAnimBar() {
        const clips = this.animList;
        if (clips.length === 0) return null;
        const anim = this.anim;
        const pct = `${(Math.max(0, Math.min(1, anim.progress)) * 100).toFixed(2)}%`;
        const barBtn: React.CSSProperties = {
            ...GLASS,
            height: 32,
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: MONO,
            fontSize: 12,
            color: '#e7ecf6',
            pointerEvents: 'auto'
        };
        return (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px 16px' }}>
                <button onClick={this.cycleSpeed} title="Playback speed" className="mcs-bar-btn" style={{ ...barBtn, minWidth: 52, padding: '0 10px' }}>
                    {`${Number(anim.speed).toFixed(1)}×`}
                </button>

                <button onClick={this.togglePlay} title="Play / pause" className="mcs-bar-btn" style={{ ...barBtn, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    {anim.playing ?
                        <div style={{ display: 'flex', gap: 3 }}><div style={{ width: 3, height: 11, background: '#e7ecf6' }} /><div style={{ width: 3, height: 11, background: '#e7ecf6' }} /></div> :
                        <div style={{ width: 0, height: 0, borderLeft: '10px solid #e7ecf6', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', marginLeft: 2 }} />}
                </button>

                <div
                    onPointerDown={(e) => {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); this.seek(e.clientX, e.currentTarget);
                    }}
                    onPointerMove={(e) => {
                        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) this.seek(e.clientX, e.currentTarget);
                    }}
                    style={{ position: 'relative', flex: 1, height: 28, cursor: 'pointer', touchAction: 'none', pointerEvents: 'auto' }}
                >
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, marginTop: -1, background: 'rgba(176,194,228,0.16)' }} />
                    <div style={{ position: 'absolute', left: 0, top: '50%', height: 2, marginTop: -1, background: 'linear-gradient(90deg, rgba(214,166,75,0.35), #d6a64b)', width: pct }} />
                    <div style={{ position: 'absolute', top: '50%', left: pct, width: 11, height: 11, margin: '-5.5px 0 0 -5.5px', borderRadius: '50%', background: '#e8c684', boxShadow: '0 0 0 3px rgba(214,166,75,0.22), 0 0 12px rgba(214,166,75,0.45)' }} />
                </div>

                <div style={{ position: 'relative', pointerEvents: 'auto' }}>
                    <button onClick={() => this.setState(s => ({ menu: !s.menu }))} title="Animation clip" className="mcs-bar-btn" style={{ ...barBtn, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{anim.selectedTrack || clips[0]}</span><span style={{ color: '#8a93a8', fontSize: 9 }}>▲</span>
                    </button>
                    {this.state.menu &&
                        <>
                            <div onClick={() => this.setState({ menu: false })} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                            <div style={{ position: 'absolute', right: 0, bottom: 40, minWidth: '100%', background: '#0f141d', border: '1px solid rgba(176,194,228,0.12)', borderRadius: 8, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 30 }}>
                                {clips.map(name => (
                                    <div key={name} onClick={() => this.pickClip(name)} className="mcs-menu-item" style={{ padding: '8px 12px', borderRadius: 5, fontFamily: MONO, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', color: name === anim.selectedTrack ? '#e8c684' : '#e7ecf6' }}>{name}</div>
                                ))}
                            </div>
                        </>}
                </div>
            </div>
        );
    }

    // passes inspection: diagonal pass-picker labels + live stats readout.
    // Phase A renders the selected pass full-viewport; PHASE B (viewer.ts) will render all
    // eleven simultaneously as scissored slices behind these same divider lines.
    renderPasses() {
        if (!this.state.passesMode) return null;
        const scene = this.props.observerData.scene;
        const N = PASS_DEFS.length;
        const cx = (i: number) => +(8 + i * (82 / (N - 1))).toFixed(2); // divider x%, matches prototype

        return (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {/* diagonal divider lines + vertical pass labels (each selects that pass) */}
                {PASS_DEFS.map((p, i) => {
                    const active = this.state.expandedPass === p.name;
                    return (
                        <div key={p.name} style={{ position: 'absolute', left: `${cx(i)}%`, top: '50%', width: 1, height: '103vh', background: active ? 'rgba(214,166,75,0.5)' : 'rgba(176,194,228,0.26)', transform: 'translate(-50%,-50%) rotate(11.31deg)' }}>
                            <div
                                onClick={() => this.pickPass(p)}
                                className="mcs-pass-label"
                                style={{ position: 'absolute', bottom: 145, left: 10, writingMode: 'vertical-rl', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, letterSpacing: '0.10em', color: active ? '#e8c684' : 'rgba(231,236,246,0.78)', textShadow: '0 1px 8px rgba(0,0,0,0.6)', cursor: 'pointer', pointerEvents: 'auto' }}
                            >{p.name}</div>
                        </div>
                    );
                })}

                {/* active-pass chip */}
                {this.state.expandedPass &&
                    <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, ...GLASS, border: '1px solid rgba(214,166,75,0.35)', borderRadius: 7, padding: '7px 13px' }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.14em', color: '#e8c684' }}>{this.state.expandedPass.toUpperCase()}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', color: '#8a93a8' }}>CLICK LABEL TO TOGGLE</span>
                    </div>}

                {/* live stats readout (real scene data) */}
                <div style={{ position: 'absolute', left: 22, top: 20, fontFamily: MONO, fontSize: 12, lineHeight: 1.9, letterSpacing: '0.08em', color: '#8a93a8', pointerEvents: 'none' }}>
                    <div>TRIANGLES <span style={{ color: '#e8c684' }}>{scene.primitiveCount ?? 0}</span></div>
                    <div>VERTICES <span style={{ color: '#e8c684' }}>{scene.vertexCount ?? 0}</span></div>
                    <div>MESHES <span style={{ color: '#e8c684' }}>{scene.meshCount ?? 0}</span></div>
                    <div>MATERIALS <span style={{ color: '#e8c684' }}>{scene.materialCount ?? 0}</span></div>
                </div>
            </div>
        );
    }

    // branded help modal
    renderHelp() {
        if (!this.state.help) return null;
        const chip: React.CSSProperties = {
            justifySelf: 'start',
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.08em',
            color: '#e8c684',
            background: 'rgba(214,166,75,0.08)',
            border: '1px solid rgba(214,166,75,0.25)',
            borderRadius: 5,
            padding: '5px 9px',
            whiteSpace: 'nowrap'
        };
        const row = (key: string, label: string) => (
            <>
                <div style={chip}>{key}</div>
                <div style={{ fontSize: 14 }}>{label}</div>
            </>
        );
        return (
            <div onClick={() => this.setState({ help: false })} style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,10,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', pointerEvents: 'auto' }}>
                <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 400, maxWidth: 'calc(100vw - 48px)', background: '#0f141d', border: '1px solid rgba(176,194,228,0.12)', borderRadius: 14, padding: '30px 32px 26px', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
                    <button onClick={() => this.setState({ help: false })} title="Close" className="mcs-close" style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, background: 'transparent', border: 'none', cursor: 'pointer', color: '#8a93a8', fontFamily: MONO, fontSize: 14, padding: 0 }}>✕</button>

                    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em', color: '#8a93a8', marginBottom: 18 }}>CONTROLS</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center' }}>
                        {row('LEFT DRAG', 'Rotate')}
                        {row('SCROLL', 'Zoom')}
                        {row('DOUBLE CLICK', 'Reset camera')}
                        {row('SHIFT + DRAG', 'Rotate lights')}
                    </div>

                    <div style={{ height: 1, background: 'rgba(176,194,228,0.12)', margin: '24px 0 20px' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <img src="static/mcs-logo.png" alt="MegaCity" style={{ width: 34, height: 34, display: 'block' }} />
                        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.30em', marginLeft: '0.30em' }}>MEGACITY <span style={{ color: '#d6a64b' }}>VIEWER</span></div>
                        <a href="https://megacity.studio" target="_blank" rel="noreferrer" className="mcs-link" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8a93a8', textDecoration: 'none' }}>MEGACITY.STUDIO</a>
                    </div>
                </div>
            </div>
        );
    }
}

export default McsViewerOverlay;
