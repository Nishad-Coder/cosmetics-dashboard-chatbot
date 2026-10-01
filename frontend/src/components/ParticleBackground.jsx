import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ParticleBackground() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })

    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0f0f13, 1)
    mount.appendChild(renderer.domElement)

    // Create particles
    const particlesGeometry = new THREE.BufferGeometry()
    const particlesCount = 1500
    const posArray = new Float32Array(particlesCount * 3)
    const velocities = []

    for (let i = 0; i < particlesCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 20
      posArray[i + 1] = (Math.random() - 0.5) * 20
      posArray[i + 2] = (Math.random() - 0.5) * 20

      velocities.push({
        x: (Math.random() - 0.5) * 0.002,
        y: (Math.random() - 0.5) * 0.002,
        z: (Math.random() - 0.5) * 0.002,
      })
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))

    // Particle material with custom shader-like appearance
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.03,
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial)
    scene.add(particlesMesh)

    // Add secondary particle system with different color
    const particlesGeometry2 = new THREE.BufferGeometry()
    const particlesCount2 = 800
    const posArray2 = new Float32Array(particlesCount2 * 3)

    for (let i = 0; i < particlesCount2 * 3; i += 3) {
      posArray2[i] = (Math.random() - 0.5) * 25
      posArray2[i + 1] = (Math.random() - 0.5) * 25
      posArray2[i + 2] = (Math.random() - 0.5) * 25
    }

    particlesGeometry2.setAttribute('position', new THREE.BufferAttribute(posArray2, 3))

    const particlesMaterial2 = new THREE.PointsMaterial({
      size: 0.02,
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    const particlesMesh2 = new THREE.Points(particlesGeometry2, particlesMaterial2)
    scene.add(particlesMesh2)

    // Add connecting lines between nearby particles
    const lineGeometry = new THREE.BufferGeometry()
    const linePositions = []
    const lineCount = 200

    for (let i = 0; i < lineCount; i++) {
      const x1 = (Math.random() - 0.5) * 15
      const y1 = (Math.random() - 0.5) * 15
      const z1 = (Math.random() - 0.5) * 15
      const x2 = x1 + (Math.random() - 0.5) * 3
      const y2 = y1 + (Math.random() - 0.5) * 3
      const z2 = z1 + (Math.random() - 0.5) * 3

      linePositions.push(x1, y1, z1, x2, y2, z2)
    }

    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
    })

    const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial)
    scene.add(linesMesh)

    camera.position.z = 5

    // Mouse interaction
    let mouseX = 0
    let mouseY = 0

    const handleMouseMove = (event) => {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1
    }

    window.addEventListener('mousemove', handleMouseMove)

    // Animation
    let animationId
    const clock = new THREE.Clock()

    const animate = () => {
      animationId = requestAnimationFrame(animate)
      const elapsedTime = clock.getElapsedTime()

      // Rotate particle systems
      particlesMesh.rotation.y = elapsedTime * 0.02
      particlesMesh.rotation.x = elapsedTime * 0.01
      particlesMesh2.rotation.y = -elapsedTime * 0.015
      particlesMesh2.rotation.z = elapsedTime * 0.01

      // Animate individual particles
      const positions = particlesGeometry.attributes.position.array
      for (let i = 0; i < particlesCount; i++) {
        const i3 = i * 3
        positions[i3] += velocities[i].x
        positions[i3 + 1] += velocities[i].y
        positions[i3 + 2] += velocities[i].z

        // Boundary check
        if (Math.abs(positions[i3]) > 10) velocities[i].x *= -1
        if (Math.abs(positions[i3 + 1]) > 10) velocities[i].y *= -1
        if (Math.abs(positions[i3 + 2]) > 10) velocities[i].z *= -1
      }
      particlesGeometry.attributes.position.needsUpdate = true

      // Mouse parallax
      camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.02
      camera.position.y += (mouseY * 0.5 - camera.position.y) * 0.02
      camera.lookAt(scene.position)

      renderer.render(scene, camera)
    }

    animate()

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      mount.removeChild(renderer.domElement)
      particlesGeometry.dispose()
      particlesMaterial.dispose()
      particlesGeometry2.dispose()
      particlesMaterial2.dispose()
      lineGeometry.dispose()
      lineMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
