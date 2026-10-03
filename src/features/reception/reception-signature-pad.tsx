import { forwardRef, useImperativeHandle, useRef } from 'react';
export interface SignaturePadHandle { clear(): void; png(): Promise<Blob | null> }
export function canvasPng(canvas: HTMLCanvasElement, empty: boolean): Promise<Blob | null> {
    return empty ? Promise.resolve(null) : new Promise(resolve => {
        try { canvas.toBlob(resolve, 'image/png'); } catch { resolve(null); }
    });
}
export const ReceptionSignaturePad = forwardRef<SignaturePadHandle, {
    readonly disabled: boolean; readonly onDrawing: (hasInk: boolean) => void;
}>(function ReceptionSignaturePad({ disabled, onDrawing }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const ink = useRef(false);
    const pointer = useRef<number | null>(null);
    const clear = () => {
        const target = canvas.current;
        target?.getContext('2d')?.clearRect(0, 0, target.width, target.height);
        ink.current = false; pointer.current = null; onDrawing(false);
    };
    useImperativeHandle(ref, () => ({ clear, png: () => canvas.current === null ? Promise.resolve(null) : canvasPng(canvas.current, !ink.current) }));
    return <div className="reception-pad">
        <p id="signature-instructions">Dibuja la firma con el dedo, lápiz o mouse dentro del recuadro. Usa Limpiar para comenzar de nuevo.</p>
        <canvas ref={canvas} width={1440} height={720} aria-label="Firma manuscrita de recepción" aria-describedby="signature-instructions"
            aria-disabled={disabled} onPointerDown={event => {
                if (disabled || pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
                const target = event.currentTarget, context = target.getContext('2d'), box = target.getBoundingClientRect();
                if (context === null || box.width === 0 || box.height === 0) return;
                event.preventDefault(); pointer.current = event.pointerId;
                target.setPointerCapture(event.pointerId);
                const x = (event.clientX - box.left) * target.width / box.width, y = (event.clientY - box.top) * target.height / box.height;
                context.lineWidth = 2.5 * target.width / box.width; context.lineCap = 'round'; context.lineJoin = 'round';
                context.strokeStyle = '#172b4d'; context.beginPath(); context.moveTo(x, y); context.lineTo(x + 0.1, y + 0.1); context.stroke();
                ink.current = true; onDrawing(true);
            }} onPointerMove={event => {
                if (disabled || pointer.current !== event.pointerId) return;
                event.preventDefault();
                const target = event.currentTarget, context = target.getContext('2d'), box = target.getBoundingClientRect();
                if (context === null || box.width === 0 || box.height === 0) return;
                context.lineTo((event.clientX - box.left) * target.width / box.width, (event.clientY - box.top) * target.height / box.height); context.stroke();
            }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}
            onLostPointerCapture={() => { pointer.current = null; }}/>
        <button className="ui-button" type="button" disabled={disabled} onClick={clear}>Limpiar</button>
    </div>;
});
