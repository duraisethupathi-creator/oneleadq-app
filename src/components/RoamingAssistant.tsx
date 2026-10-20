import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Keyboard, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

export const ASSISTANT_DOCK_HEIGHT = 194; // 122 character + 12 gap + 48 controls + 12 bottom.
export function clampCharacter(x: number, y: number, width: number, height: number) {
  return { x: Math.max(0, Math.min(x, Math.max(0, width - 100))), y: Math.max(0, Math.min(y, Math.max(0, height - ASSISTANT_DOCK_HEIGHT))) };
}

/** Normal roaming is touch-transparent. Reposition mode captures only the character until release. */
export default function RoamingAssistant({ active, awake, paused = false, bottomInset = 0, onOpen, onWake, children }: {
  active: boolean; awake: boolean; paused?: boolean; bottomInset?: number; onOpen: () => void; onWake?: () => void; children: (running: boolean, walking: boolean, left: boolean) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const height = ASSISTANT_DOCK_HEIGHT;
  const [keyboard, setKeyboard] = useState(false);
  const [reposition, setReposition] = useState(false);
  const [anchored, setAnchored] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(true);
  const previousX = useRef(width / 2 - 50);
  const point = useRef(new Animated.ValueXY(clampCharacter(width / 2 - 50, height / 2 - 61, width, height))).current;
  const start = useRef({ x: 0, y: 0 });
  const dimensions = useRef({ width, height });
  dimensions.current = { width, height };
  const canDrag = useRef(false);
  canDrag.current = reposition && active && !keyboard;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { setKeyboard(true); setReposition(false); });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); point.stopAnimation(); };
  }, [point]);

  useEffect(() => {
    if (paused || !active || !awake || keyboard || reposition || anchored) { point.stopAnimation(); return; }
    let stopped = false;
    let animation: Animated.CompositeAnimation | undefined;
    let step = 0;
    function move() {
      if (stopped) return;
      const targets = [
        { x: 12, y: height * 0.38 },
        { x: width / 2 - 50, y: height / 2 - 61 },
        { x: width - 112, y: height * 0.48 },
      ];
      const fast = step % 3 === 2;
      setRunning(fast);
      const next = targets[step++ % targets.length];
      setLeft(next.x < previousX.current);
      previousX.current = next.x;
      animation = Animated.timing(point, { toValue: clampCharacter(next.x, next.y, width, height), duration: fast ? 2600 : 6000, useNativeDriver: true });
      animation.start(({ finished }) => { if (finished && !stopped) move(); });
    }
    point.stopAnimation(position => { if (!stopped) { point.setValue(clampCharacter(position.x, position.y, width, height)); move(); } });
    return () => { stopped = true; animation?.stop(); point.stopAnimation(); };
  }, [active, awake, paused, keyboard, reposition, anchored, width, height, point]);

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => canDrag.current,
    onMoveShouldSetPanResponder: () => canDrag.current,
    onPanResponderGrant: () => point.stopAnimation(position => { start.current = position; }),
    onPanResponderMove: (_, gesture) => point.setValue(clampCharacter(start.current.x + gesture.dx, start.current.y + gesture.dy, dimensions.current.width, dimensions.current.height)),
    onPanResponderRelease: () => { setAnchored(true); setReposition(false); },
    onPanResponderTerminate: () => { setAnchored(true); setReposition(false); },
  })).current;

  return <View pointerEvents="box-none" style={[s.dock, { bottom: bottomInset }]}>
    {active && !keyboard && <Animated.View {...responder.panHandlers} pointerEvents={reposition ? 'auto' : 'none'}
      accessible accessibilityRole="image" accessibilityLabel="OneLeadQ roaming character"
      accessibilityHint="Choose Move assistant below to drag within the assistant dock."
      style={[s.character, { transform: point.getTranslateTransform() }]}>
      {children(running && !anchored && !reposition && awake, !paused && !anchored && !reposition && awake, left)}
    </Animated.View>}
    {active && !keyboard && <View pointerEvents="box-none" style={s.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open OneLeadQ assistant" onPress={onOpen} style={s.button}><Text style={s.label}>AI பேசு / Talk</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={reposition ? 'Cancel moving assistant' : 'Reposition OneLeadQ assistant'}
        onPress={() => { onWake?.(); point.stopAnimation(); setReposition(value => !value); }} style={s.button}><Text style={s.label}>{reposition ? 'Cancel / ரத்து' : 'Move / நகர்த்து'}</Text></Pressable>
      {anchored && <Pressable accessibilityRole="button" accessibilityLabel="Resume assistant walking" onPress={() => { onWake?.(); setAnchored(false); setReposition(false); }} style={s.button}><Text style={s.label}>Walk / நட</Text></Pressable>}
    </View>}
    {reposition && <Text accessibilityLiveRegion="polite" style={s.hint}>Drag the character, then release / நகர்த்தி விடவும்</Text>}
  </View>;
}
const s = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, height: ASSISTANT_DOCK_HEIGHT, overflow: 'hidden', backgroundColor: colors.cream },
  character: { position: 'absolute', top: 0, left: 0, width: 100, height: 122 },
  controls: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  button: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 6, justifyContent: 'center', borderRadius: 14, backgroundColor: colors.green },
  label: { color: colors.gold, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  hint: { position: 'absolute', bottom: 64, left: 16, right: 16, padding: 8, backgroundColor: colors.cream, color: colors.green, textAlign: 'center' },
});
