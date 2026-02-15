import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, PerspectiveCamera, ContactShadows, Float, Html, Center, Stars } from '@react-three/drei';
import * as THREE from 'three';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8d7da',
                    color: '#721c24',
                    borderRadius: '20px'
                }}>
                    3D Scene Error: {this.state.hasError.toString()}
                </div>
            );
        }
        return this.props.children;
    }
}

function Model({ url, spinning = true }) {
    const { scene } = useGLTF(url);
    const pivotRef = useRef();

    useFrame((state, delta) => {
        if (spinning && pivotRef.current) {
            pivotRef.current.rotation.y += delta * 0.8;
        }
    });

    return (
        <Float speed={2} rotationIntensity={0.1} floatIntensity={0.4}>
            <group ref={pivotRef}>
                <Center>
                    <primitive
                        object={scene}
                        scale={2.5}
                    />
                </Center>
            </group>
        </Float>
    );
}


function Stage() {
    return (
        <group position={[0, -2, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <circleGeometry args={[2.5, 64]} />
                <meshStandardMaterial color="#338e55" opacity={0.3} transparent />
            </mesh>
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.4, 2.5, 64]} />
                <meshStandardMaterial color="#338e55" />
            </mesh>
        </group>
    );
}

const characters = [
    { id: 1, name: 'Prof. Sterling', file: '/character-1.glb', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: 'P' },
    { id: 2, name: 'Dr. Elara', file: '/character-2.glb', color: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)', label: 'D' },
    { id: 3, name: 'Sage', file: '/character-3.glb', color: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', label: 'S' },
    { id: 4, name: 'Aris', file: '/character-4.glb', color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', label: 'A' },
];

export default function CharacterScene() {
    const [currentIndex, setCurrentIndex] = useState(0);

    const nextCharacter = () => {
        setCurrentIndex((prev) => (prev + 1) % characters.length);
    };

    const prevCharacter = () => {
        setCurrentIndex((prev) => (prev - 1 + characters.length) % characters.length);
    };

    return (
        <div className="character-selection-container">
            <h3 className="character-selection-title">Pick a Prof</h3>
            <div className="character-canvas-wrapper">
                <ErrorBoundary>
                    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
                        <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={35} />
                        <ambientLight intensity={1.2} />
                        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />
                        <pointLight position={[-10, 5, -5]} intensity={1} color="#338e55" />
                        <directionalLight position={[0, 5, 5]} intensity={0.5} />

                        <Suspense fallback={<Html center><div className="loader-orbit"></div></Html>}>
                            <group position={[0, -0.2, 0]}>
                                <Model key={characters[currentIndex].file} url={characters[currentIndex].file} spinning={true} />
                            </group>

                            <Environment preset="city" />
                            <ContactShadows position={[0, -2.5, 0]} opacity={0.6} scale={10} blur={2.5} far={1.5} />
                        </Suspense>

                        <OrbitControls
                            enableRotate={false}
                            enableZoom={false}
                            enablePan={false}
                            makeDefault
                        />
                    </Canvas>
                </ErrorBoundary>

                <button className="selection-arrow left" onClick={prevCharacter} aria-label="Previous character">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <button className="selection-arrow right" onClick={nextCharacter} aria-label="Next character">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            </div>

            <div className="character-menu-overlay">
                <div className="character-scroll-bar">
                    {characters.map((char, index) => (
                        <div
                            key={char.id}
                            className={`character-item ${index === currentIndex ? 'active' : ''}`}
                            onClick={() => setCurrentIndex(index)}
                        >
                            <div className="character-pfp" style={{ background: char.color }}>
                                <span className="pfp-initial">{char.label}</span>
                            </div>
                            <span className="character-name-bottom">{char.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
