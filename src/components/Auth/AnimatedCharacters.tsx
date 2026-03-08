import React, { useEffect, useMemo, useRef, useState } from 'react';

interface MousePosition {
  x: number;
  y: number;
}

interface PupilProps {
  mousePosition: MousePosition;
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

interface EyeBallProps {
  mousePosition: MousePosition;
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

interface AnimatedCharactersProps {
  isTyping?: boolean;
  showPassword?: boolean;
  passwordLength?: number;
}

function useMousePosition(): MousePosition {
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return mousePosition;
}

function useRandomBlink(): boolean {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    let blinkTimer: number | undefined;
    let resetTimer: number | undefined;

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        setIsBlinking(true);
        resetTimer = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 150);
      }, Math.random() * 4000 + 3000);
    };

    scheduleBlink();

    return () => {
      if (blinkTimer) {
        window.clearTimeout(blinkTimer);
      }
      if (resetTimer) {
        window.clearTimeout(resetTimer);
      }
    };
  }, []);

  return isBlinking;
}

function calculateEyeOffset(
  rect: DOMRect | null,
  mousePosition: MousePosition,
  maxDistance: number,
  forceLookX?: number,
  forceLookY?: number,
) {
  if (forceLookX !== undefined && forceLookY !== undefined) {
    return { x: forceLookX, y: forceLookY };
  }

  if (!rect) {
    return { x: 0, y: 0 };
  }

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = mousePosition.x - centerX;
  const deltaY = mousePosition.y - centerY;
  const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
  const angle = Math.atan2(deltaY, deltaX);

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}

function Pupil({
  mousePosition,
  size = 12,
  maxDistance = 5,
  pupilColor = '#2D2D2D',
  forceLookX,
  forceLookY,
}: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null);

  const pupilPosition = useMemo(
    () => calculateEyeOffset(pupilRef.current?.getBoundingClientRect() ?? null, mousePosition, maxDistance, forceLookX, forceLookY),
    [forceLookX, forceLookY, maxDistance, mousePosition],
  );

  return (
    <div
      ref={pupilRef}
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
}

function EyeBall({
  mousePosition,
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = '#FFFFFF',
  pupilColor = '#2D2D2D',
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const eyeRef = useRef<HTMLDivElement>(null);

  const pupilPosition = useMemo(
    () => calculateEyeOffset(eyeRef.current?.getBoundingClientRect() ?? null, mousePosition, maxDistance, forceLookX, forceLookY),
    [forceLookX, forceLookY, maxDistance, mousePosition],
  );

  return (
    <div
      ref={eyeRef}
      style={{
        width: size,
        height: isBlinking ? 2 : size,
        borderRadius: '999px',
        backgroundColor: eyeColor,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}
    >
      {!isBlinking ? (
        <div
          style={{
            width: pupilSize,
            height: pupilSize,
            borderRadius: '999px',
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      ) : null}
    </div>
  );
}

function calculateCharacterPosition(ref: React.RefObject<HTMLDivElement | null>, mousePosition: MousePosition) {
  if (!ref.current) {
    return { faceX: 0, faceY: 0, bodySkew: 0 };
  }

  const rect = ref.current.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 3;
  const deltaX = mousePosition.x - centerX;
  const deltaY = mousePosition.y - centerY;

  return {
    faceX: Math.max(-15, Math.min(15, deltaX / 20)),
    faceY: Math.max(-10, Math.min(10, deltaY / 30)),
    bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
  };
}

export default function AnimatedCharacters({
  isTyping = false,
  showPassword = false,
  passwordLength = 0,
}: AnimatedCharactersProps) {
  const mousePosition = useMousePosition();
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const isPurpleBlinking = useRandomBlink();
  const isBlackBlinking = useRandomBlink();

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTyping) {
      setIsLookingAtEachOther(false);
      return undefined;
    }

    setIsLookingAtEachOther(true);
    const timer = window.setTimeout(() => {
      setIsLookingAtEachOther(false);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isTyping]);

  useEffect(() => {
    if (!(passwordLength > 0 && showPassword)) {
      setIsPurplePeeking(false);
      return undefined;
    }

    let peekTimer: number | undefined;
    let resetTimer: number | undefined;

    const schedulePeek = () => {
      peekTimer = window.setTimeout(() => {
        setIsPurplePeeking(true);
        resetTimer = window.setTimeout(() => {
          setIsPurplePeeking(false);
          schedulePeek();
        }, 800);
      }, Math.random() * 3000 + 2000);
    };

    schedulePeek();

    return () => {
      if (peekTimer) {
        window.clearTimeout(peekTimer);
      }
      if (resetTimer) {
        window.clearTimeout(resetTimer);
      }
    };
  }, [passwordLength, showPassword]);

  const purplePosition = calculateCharacterPosition(purpleRef, mousePosition);
  const blackPosition = calculateCharacterPosition(blackRef, mousePosition);
  const yellowPosition = calculateCharacterPosition(yellowRef, mousePosition);
  const orangePosition = calculateCharacterPosition(orangeRef, mousePosition);
  const isHidingPassword = passwordLength > 0 && !showPassword;

  return (
    <div style={{ position: 'relative', width: 550, height: 400 }}>
      <div
        ref={purpleRef}
        style={{
          position: 'absolute',
          left: 70,
          bottom: 0,
          width: 180,
          height: isTyping || isHidingPassword ? 440 : 400,
          backgroundColor: '#6C3FF5',
          borderRadius: '10px 10px 0 0',
          zIndex: 1,
          transform:
            passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : isTyping || isHidingPassword
                ? `skewX(${purplePosition.bodySkew - 12}deg) translateX(40px)`
                : `skewX(${purplePosition.bodySkew}deg)`,
          transformOrigin: 'bottom center',
          transition: 'all 0.7s ease-in-out',
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 32,
            left: passwordLength > 0 && showPassword ? 20 : isLookingAtEachOther ? 55 : 45 + purplePosition.faceX,
            top: passwordLength > 0 && showPassword ? 35 : isLookingAtEachOther ? 65 : 40 + purplePosition.faceY,
            transition: 'all 0.7s ease-in-out',
          }}
        >
          <EyeBall
            mousePosition={mousePosition}
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="#FFFFFF"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={passwordLength > 0 && showPassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
          />
          <EyeBall
            mousePosition={mousePosition}
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="#FFFFFF"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={passwordLength > 0 && showPassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
          />
        </div>
      </div>

      <div
        ref={blackRef}
        style={{
          position: 'absolute',
          left: 240,
          bottom: 0,
          width: 120,
          height: 310,
          backgroundColor: '#2D2D2D',
          borderRadius: '8px 8px 0 0',
          zIndex: 2,
          transform:
            passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : isLookingAtEachOther
                ? `skewX(${blackPosition.bodySkew * 1.5 + 10}deg) translateX(20px)`
                : isTyping || isHidingPassword
                  ? `skewX(${blackPosition.bodySkew * 1.5}deg)`
                  : `skewX(${blackPosition.bodySkew}deg)`,
          transformOrigin: 'bottom center',
          transition: 'all 0.7s ease-in-out',
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 24,
            left: passwordLength > 0 && showPassword ? 10 : isLookingAtEachOther ? 32 : 26 + blackPosition.faceX,
            top: passwordLength > 0 && showPassword ? 28 : isLookingAtEachOther ? 12 : 32 + blackPosition.faceY,
            transition: 'all 0.7s ease-in-out',
          }}
        >
          <EyeBall
            mousePosition={mousePosition}
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="#FFFFFF"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined}
          />
          <EyeBall
            mousePosition={mousePosition}
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="#FFFFFF"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined}
          />
        </div>
      </div>

      <div
        ref={orangeRef}
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 240,
          height: 200,
          backgroundColor: '#FF9B6B',
          borderRadius: '120px 120px 0 0',
          zIndex: 3,
          transform: passwordLength > 0 && showPassword ? 'skewX(0deg)' : `skewX(${orangePosition.bodySkew}deg)`,
          transformOrigin: 'bottom center',
          transition: 'all 0.7s ease-in-out',
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 32,
            left: passwordLength > 0 && showPassword ? 50 : 82 + orangePosition.faceX,
            top: passwordLength > 0 && showPassword ? 85 : 90 + orangePosition.faceY,
            transition: 'all 0.2s ease-out',
          }}
        >
          <Pupil
            mousePosition={mousePosition}
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
          />
          <Pupil
            mousePosition={mousePosition}
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
          />
        </div>
      </div>

      <div
        ref={yellowRef}
        style={{
          position: 'absolute',
          left: 310,
          bottom: 0,
          width: 140,
          height: 230,
          backgroundColor: '#E8D754',
          borderRadius: '70px 70px 0 0',
          zIndex: 4,
          transform: passwordLength > 0 && showPassword ? 'skewX(0deg)' : `skewX(${yellowPosition.bodySkew}deg)`,
          transformOrigin: 'bottom center',
          transition: 'all 0.7s ease-in-out',
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 24,
            left: passwordLength > 0 && showPassword ? 20 : 52 + yellowPosition.faceX,
            top: passwordLength > 0 && showPassword ? 35 : 40 + yellowPosition.faceY,
            transition: 'all 0.2s ease-out',
          }}
        >
          <Pupil
            mousePosition={mousePosition}
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
          />
          <Pupil
            mousePosition={mousePosition}
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            width: 80,
            height: 4,
            left: passwordLength > 0 && showPassword ? 10 : 40 + yellowPosition.faceX,
            top: passwordLength > 0 && showPassword ? 88 : 88 + yellowPosition.faceY,
            backgroundColor: '#2D2D2D',
            borderRadius: 999,
            transition: 'all 0.2s ease-out',
          }}
        />
      </div>
    </div>
  );
}
