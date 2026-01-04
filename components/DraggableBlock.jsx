'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './DraggableBlock.module.css'

export default function DraggableBlock({ 
  id,
  children, 
  defaultPosition = { x: 0, y: 0 },
  defaultSize = { width: 400, height: 300 },
  minSize = { width: 200, height: 150 },
  onPositionChange = null,
  onSizeChange = null,
  title = '',
  gridSize = 20, // Grid snap size in pixels
  allBlocks = {}, // All other blocks for collision detection
  allBlockRefs = {}, // Refs to update other blocks
  onUpdate = null, // Callback to update parent state
  onRegisterRef = null // Callback to register this block's update function
}) {
  const [position, setPosition] = useState(defaultPosition)
  const [size, setSize] = useState(defaultSize)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState('')
  const blockRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  // Snap value to grid
  const snapToGrid = (value) => {
    return Math.round(value / gridSize) * gridSize
  }

  // Check if two rectangles overlap
  const checkOverlap = (rect1, rect2) => {
    return !(
      rect1.x + rect1.width <= rect2.x ||
      rect2.x + rect2.width <= rect1.x ||
      rect1.y + rect1.height <= rect2.y ||
      rect2.y + rect2.height <= rect1.y
    )
  }

  // Find next available column or row for a block that needs to be pushed
  const findNextAvailablePosition = (blockToMove, movingBlockRect) => {
    const { position: otherPos, size: otherSize } = blockToMove
    const otherRect = {
      x: otherPos.x,
      y: otherPos.y,
      width: otherSize.width,
      height: otherSize.height
    }

    // Try moving to the right (next column)
    let newX = snapToGrid(movingBlockRect.x + movingBlockRect.width)
    let newY = otherRect.y
    let testRect = { x: newX, y: newY, width: otherRect.width, height: otherRect.height }
    
    // Check if right position is valid (within viewport and no overlaps)
    if (newX + otherRect.width <= window.innerWidth) {
      let valid = true
      for (const [blockId, blockData] of Object.entries(allBlocks)) {
        if (blockId === id || !blockData.position || !blockData.size) continue
        const checkRect = {
          x: blockData.position.x,
          y: blockData.position.y,
          width: blockData.size.width,
          height: blockData.size.height
        }
        if (checkOverlap(testRect, checkRect)) {
          valid = false
          break
        }
      }
      if (valid) {
        return { x: newX, y: newY }
      }
    }

    // Try moving below (next row)
    newX = otherRect.x
    newY = snapToGrid(movingBlockRect.y + movingBlockRect.height)
    testRect = { x: newX, y: newY, width: otherRect.width, height: otherRect.height }
    
    // Check if below position is valid
    if (newY + otherRect.height <= window.innerHeight) {
      let valid = true
      for (const [blockId, blockData] of Object.entries(allBlocks)) {
        if (blockId === id || !blockData.position || !blockData.size) continue
        const checkRect = {
          x: blockData.position.x,
          y: blockData.position.y,
          width: blockData.size.width,
          height: blockData.size.height
        }
        if (checkOverlap(testRect, checkRect)) {
          valid = false
          break
        }
      }
      if (valid) {
        return { x: newX, y: newY }
      }
    }

    // Fallback: find any available position using spiral search
    const centerX = otherRect.x + otherRect.width / 2
    const centerY = otherRect.y + otherRect.height / 2
    const maxDistance = Math.max(window.innerWidth, window.innerHeight)
    
    for (let distance = gridSize; distance < maxDistance; distance += gridSize) {
      const positions = [
        { x: centerX, y: centerY - distance },
        { x: centerX + distance, y: centerY },
        { x: centerX, y: centerY + distance },
        { x: centerX - distance, y: centerY },
      ]

      for (const pos of positions) {
        const snappedX = snapToGrid(pos.x)
        const snappedY = snapToGrid(pos.y)
        
        if (snappedX < 0 || snappedY < 0 || 
            snappedX + otherRect.width > window.innerWidth ||
            snappedY + otherRect.height > window.innerHeight) {
          continue
        }

        testRect = { x: snappedX, y: snappedY, width: otherRect.width, height: otherRect.height }
        let valid = true
        
        for (const [blockId, blockData] of Object.entries(allBlocks)) {
          if (blockId === id || !blockData.position || !blockData.size) continue
          const checkRect = {
            x: blockData.position.x,
            y: blockData.position.y,
            width: blockData.size.width,
            height: blockData.size.height
          }
          if (checkOverlap(testRect, checkRect)) {
            valid = false
            break
          }
        }
        
        if (valid) {
          return { x: snappedX, y: snappedY }
        }
      }
    }
    
    // Last resort: stack below
    let maxY = 0
    for (const [blockId, blockData] of Object.entries(allBlocks)) {
      if (blockId === id || !blockData.position || !blockData.size) continue
      maxY = Math.max(maxY, blockData.position.y + blockData.size.height)
    }
    return { x: snapToGrid(otherRect.x), y: snapToGrid(maxY) }
  }

  // Push overlapping blocks out of the way
  const pushOverlappingBlocks = (movingBlockRect) => {
    for (const [blockId, blockData] of Object.entries(allBlocks)) {
      if (blockId === id || !blockData.position || !blockData.size) continue
      
      const otherRect = {
        x: blockData.position.x,
        y: blockData.position.y,
        width: blockData.size.width,
        height: blockData.size.height
      }
      
      if (checkOverlap(movingBlockRect, otherRect)) {
        // This block overlaps, push it to next column/row
        const newPos = findNextAvailablePosition(blockData, movingBlockRect)
        
        // Update the other block's position via its ref
        if (allBlockRefs[blockId]) {
          allBlockRefs[blockId](newPos, blockData.size)
        }
      }
    }
  }

  // Load saved position/size from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`block_${id}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.position) {
          // Snap loaded position to grid
          const snappedPos = {
            x: snapToGrid(parsed.position.x),
            y: snapToGrid(parsed.position.y)
          }
          setPosition(snappedPos)
        }
        if (parsed.size) {
          // Snap loaded size to grid and constrain max width
          const maxWidth = window.innerWidth
          const snappedSize = {
            width: Math.min(snapToGrid(parsed.size.width), maxWidth),
            height: snapToGrid(parsed.size.height)
          }
          setSize(snappedSize)
        }
      } catch (e) {
        console.error('Error loading saved block state:', e)
      }
    }
  }, [id, gridSize])

  // Function to update this block's position (called by other blocks)
  const updatePositionRef = useRef(null)
  
  updatePositionRef.current = (newPosition, newSize = null) => {
    setPosition(newPosition)
    if (newSize) {
      setSize(newSize)
    }
    if (onUpdate) {
      onUpdate(id, newPosition, newSize || size)
    }
    saveState(newPosition, newSize || size)
  }

  // Register this block's update function with parent
  useEffect(() => {
    if (onRegisterRef) {
      onRegisterRef(id, (pos, sz) => updatePositionRef.current?.(pos, sz))
    }
  }, [id, onRegisterRef])

  // Initialize parent state on mount
  useEffect(() => {
    if (onUpdate) {
      onUpdate(id, position, size)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Save position/size to localStorage
  const saveState = (newPosition, newSize) => {
    try {
      localStorage.setItem(`block_${id}`, JSON.stringify({
        position: newPosition,
        size: newSize
      }))
    } catch (e) {
      console.error('Error saving block state:', e)
    }
  }

  const handleMouseDown = (e) => {
    if (e.target.closest('.resize-handle')) return
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
    
    const handleDrag = (e) => {
      let newX = e.clientX - dragStartRef.current.x
      let newY = e.clientY - dragStartRef.current.y
      
      // Snap to grid
      newX = snapToGrid(newX)
      newY = snapToGrid(newY)
      
      // Keep within viewport
      const maxX = Math.max(0, window.innerWidth - size.width)
      const maxY = Math.max(0, window.innerHeight - size.height)
      
      const constrainedX = Math.max(0, Math.min(newX, maxX))
      const constrainedY = Math.max(0, Math.min(newY, maxY))
      
      // Selected block gets priority - move to desired position
      const newPosition = { x: constrainedX, y: constrainedY }
      const movingRect = { x: constrainedX, y: constrainedY, width: size.width, height: size.height }
      
      // Push other overlapping blocks out of the way
      pushOverlappingBlocks(movingRect)
      
      setPosition(newPosition)
      if (onPositionChange) onPositionChange(id, newPosition)
      if (onUpdate) onUpdate(id, newPosition, size)
      saveState(newPosition, size)
    }

    const handleDragEnd = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }
    
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', handleDragEnd)
    e.preventDefault()
  }

  const handleResizeStart = (e, direction) => {
    setIsResizing(true)
    setResizeDirection(direction)
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      startX: position.x,
      startY: position.y
    }
    
    const handleResize = (e) => {
      const deltaX = e.clientX - resizeStartRef.current.x
      const deltaY = e.clientY - resizeStartRef.current.y
      
      let newWidth = resizeStartRef.current.width
      let newHeight = resizeStartRef.current.height
      let newX = position.x
      let newY = position.y
      
      if (direction.includes('e')) {
        newWidth = Math.max(minSize.width, resizeStartRef.current.width + deltaX)
      }
      if (direction.includes('w')) {
        newWidth = Math.max(minSize.width, resizeStartRef.current.width - deltaX)
        newX = resizeStartRef.current.startX + deltaX
      }
      if (direction.includes('s')) {
        newHeight = Math.max(minSize.height, resizeStartRef.current.height + deltaY)
      }
      if (direction.includes('n')) {
        newHeight = Math.max(minSize.height, resizeStartRef.current.height - deltaY)
        newY = resizeStartRef.current.startY + deltaY
      }
      
      // Snap to grid
      newWidth = snapToGrid(newWidth)
      newHeight = snapToGrid(newHeight)
      newX = snapToGrid(newX)
      newY = snapToGrid(newY)
      
      // Ensure minimum sizes after snapping
      if (newWidth < minSize.width) newWidth = snapToGrid(minSize.width)
      if (newHeight < minSize.height) newHeight = snapToGrid(minSize.height)
      
      // Constrain to viewport and max width (100% of screen)
      const maxWidth = window.innerWidth
      const maxX = window.innerWidth - newWidth
      const maxY = window.innerHeight - newHeight
      
      newWidth = Math.min(newWidth, maxWidth)
      newX = Math.max(0, Math.min(newX, maxX))
      newY = Math.max(0, Math.min(newY, maxY))
      
      // Ensure still within viewport
      const maxXAfterResize = Math.max(0, window.innerWidth - newWidth)
      const maxYAfterResize = Math.max(0, window.innerHeight - newHeight)
      newX = Math.max(0, Math.min(newX, maxXAfterResize))
      newY = Math.max(0, Math.min(newY, maxYAfterResize))
      
      const newSize = { width: newWidth, height: newHeight }
      const newPosition = { x: newX, y: newY }
      const resizedRect = { x: newX, y: newY, width: newWidth, height: newHeight }
      
      // Push other overlapping blocks out of the way
      pushOverlappingBlocks(resizedRect)
      
      setSize(newSize)
      setPosition(newPosition)
      if (onSizeChange) onSizeChange(id, newSize)
      if (onPositionChange) onPositionChange(id, newPosition)
      if (onUpdate) onUpdate(id, newPosition, newSize)
      saveState(newPosition, newSize)
    }

    const handleResizeEnd = () => {
      setIsResizing(false)
      setResizeDirection('')
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
    
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', handleResizeEnd)
    e.preventDefault()
    e.stopPropagation()
  }

  // Cleanup is handled in individual event handlers

  return (
    <div
      ref={blockRef}
      className={`${styles.draggableBlock} ${isDragging ? styles.dragging : ''} ${isResizing ? styles.resizing : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`
      }}
      onMouseDown={handleMouseDown}
    >
      {title && (
        <div className={styles.blockHeader}>
          <span className={styles.blockTitle}>{title}</span>
        </div>
      )}
      <div className={styles.blockContent}>
        {children}
      </div>
      
      {/* Resize handles */}
      <div className={`${styles.resizeHandle} ${styles.n} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'n')} />
      <div className={`${styles.resizeHandle} ${styles.s} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 's')} />
      <div className={`${styles.resizeHandle} ${styles.e} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'e')} />
      <div className={`${styles.resizeHandle} ${styles.w} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'w')} />
      <div className={`${styles.resizeHandle} ${styles.ne} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'ne')} />
      <div className={`${styles.resizeHandle} ${styles.nw} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'nw')} />
      <div className={`${styles.resizeHandle} ${styles.se} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'se')} />
      <div className={`${styles.resizeHandle} ${styles.sw} resize-handle`} onMouseDown={(e) => handleResizeStart(e, 'sw')} />
    </div>
  )
}

