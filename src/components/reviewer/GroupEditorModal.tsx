import React, { useState, useEffect } from 'react';
import { TranscriptionGroup, CustomField } from '../../services/database/transcriptionGroupService';
import { THEME_TOKENS } from '../../config/themeTokens';

interface GroupEditorModalProps {
  abierto: boolean;
  grupoParaEditar?: TranscriptionGroup | null;
  alCerrar: () => void;
  alGuardar: (datos: Omit<TranscriptionGroup, 'id' | 'createdAt' | 'updatedAt' | 'orden'>) => void;
}

const PALETA_COLORES = [
  '#4A5568', // Gris grafito
  '#2C5282', // Azul pericial
  '#276749', // Verde bosque
  '#744210', // Ocre / Bronce
  '#702459', // Borgoña
  '#4C51BF', // Índigo
];

export const GroupEditorModal: React.FC<GroupEditorModalProps> = ({
  abierto,
  grupoParaEditar,
  alCerrar,
  alGuardar,
}) => {
  const [nombre, setNombre] = useState('');
  const [detalles, setDetalles] = useState('');
  const [personaInvolucrada, setPersonaInvolucrada] = useState('');
  const [numeroExpediente, setNumeroExpediente] = useState('');
  const [instanciaAutoridad, setInstanciaAutoridad] = useState('');
  const [fechaExpediente, setFechaExpediente] = useState('');
  const [colorBadge, setColorBadge] = useState(PALETA_COLORES[0]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CustomField[]>([]);

  // Campos para agregar nuevo campo personalizado
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [nuevoValor, setNuevoValor] = useState('');

  useEffect(() => {
    if (abierto) {
      if (grupoParaEditar) {
        setNombre(grupoParaEditar.nombre);
        setDetalles(grupoParaEditar.detalles || grupoParaEditar.notasGrupo || '');
        setPersonaInvolucrada(grupoParaEditar.personaInvolucrada || '');
        setNumeroExpediente(grupoParaEditar.numeroExpediente || '');
        setInstanciaAutoridad(grupoParaEditar.instanciaAutoridad || '');
        setFechaExpediente(grupoParaEditar.fechaExpediente || '');
        setColorBadge(grupoParaEditar.colorBadge || PALETA_COLORES[0]);
        setCamposPersonalizados(grupoParaEditar.camposPersonalizados ? [...grupoParaEditar.camposPersonalizados] : []);
      } else {
        setNombre('');
        setDetalles('');
        setPersonaInvolucrada('');
        setNumeroExpediente('');
        setInstanciaAutoridad('');
        setFechaExpediente(new Date().toISOString().split('T')[0]);
        setColorBadge(PALETA_COLORES[Math.floor(Math.random() * PALETA_COLORES.length)]);
        setCamposPersonalizados([]);
      }
      setNuevaEtiqueta('');
      setNuevoValor('');
    }
  }, [abierto, grupoParaEditar]);

  if (!abierto) return null;

  const handleAgregarCampoPersonalizado = () => {
    if (!nuevaEtiqueta.trim()) return;
    const nuevo: CustomField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      etiqueta: nuevaEtiqueta.trim(),
      valor: nuevoValor.trim(),
    };
    setCamposPersonalizados((prev) => [...prev, nuevo]);
    setNuevaEtiqueta('');
    setNuevoValor('');
  };

  const handleEliminarCampoPersonalizado = (fieldId: string) => {
    setCamposPersonalizados((prev) => prev.filter((c) => c.id !== fieldId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      alert('Por favor ingrese el nombre que identifica el caso u objeto de análisis.');
      return;
    }

    alGuardar({
      nombre: nombre.trim(),
      detalles: detalles.trim(),
      personaInvolucrada: personaInvolucrada.trim() || undefined,
      numeroExpediente: numeroExpediente.trim() || undefined,
      instanciaAutoridad: instanciaAutoridad.trim() || undefined,
      fechaExpediente: fechaExpediente || undefined,
      notasGrupo: detalles.trim() || undefined,
      colorBadge,
      camposPersonalizados,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          borderRadius: THEME_TOKENS.radii.sm,
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: THEME_TOKENS.shadows.lg,
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            color: THEME_TOKENS.colors.textOnDark,
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📁</span>
            <div>
              <strong style={{ fontSize: '0.95rem', fontFamily: THEME_TOKENS.fonts.serif, display: 'block' }}>
                {grupoParaEditar ? 'Editar Caso o Expediente' : 'Nuevo Grupo Contenedor (Caso o Expediente)'}
              </strong>
              <span style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textOnDarkMuted }}>
                Contenedor principal para agrupar transcripciones relacionadas
              </span>
            </div>
          </div>
          <button
            onClick={alCerrar}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.35rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {/* Nombre Obligatorio (Identifica el caso) */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, marginBottom: '0.3rem' }}>
              1. Nombre que identifica el caso u objeto de análisis *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Causa Penal 104/2026 - Robo Calificado y Homicidio Culposo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.825rem',
                outline: 'none',
                fontWeight: 600,
              }}
            />
          </div>

          {/* Detalles Obligatorios (Para saber de qué trata) */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, marginBottom: '0.3rem' }}>
              2. Detalles del caso (¿De qué trata este caso o expediente?) *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Describe aquí los antecedentes del caso, los hechos a investigar, la hipótesis pericial o el objeto de análisis..."
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.8125rem',
                outline: 'none',
                resize: 'vertical',
                fontFamily: THEME_TOKENS.fonts.sans,
              }}
            />
          </div>

          {/* Persona Involucrada y Causa Judicial */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.25rem' }}>
                Persona investigada / Involucrada:
              </label>
              <input
                type="text"
                placeholder="Ej. Lic. Roberto Gómez Pérez"
                value={personaInvolucrada}
                onChange={(e) => setPersonaInvolucrada(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.25rem' }}>
                N° de Causa / Expediente:
              </label>
              <input
                type="text"
                placeholder="Ej. EXP-402-2026"
                value={numeroExpediente}
                onChange={(e) => setNumeroExpediente(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  fontSize: '0.8rem',
                  outline: 'none',
                  fontFamily: THEME_TOKENS.fonts.mono,
                }}
              />
            </div>
          </div>

          {/* Instancia / Autoridad y Fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.25rem' }}>
                Juzgado / Fiscalía / Instancia:
              </label>
              <input
                type="text"
                placeholder="Ej. Juzgado Primero de Control"
                value={instanciaAutoridad}
                onChange={(e) => setInstanciaAutoridad(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.25rem' }}>
                Fecha del Caso / Apertura:
              </label>
              <input
                type="date"
                value={fechaExpediente}
                onChange={(e) => setFechaExpediente(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Color del Distintivo */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
              Color distintivo del caso:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {PALETA_COLORES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColorBadge(c)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: colorBadge === c ? '2.5px solid #000' : '1px solid rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    outline: 'none',
                    transform: colorBadge === c ? 'scale(1.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Campos Personalizados Dinámicos */}
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: THEME_TOKENS.colors.bgCanvas,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              borderRadius: THEME_TOKENS.radii.xs,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
                Campos de detalles adicionales ({camposPersonalizados.length})
              </label>
              <span style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textMuted }}>
                Ej. Delito, Tipo de Peritaje, Lugar de los Hechos
              </span>
            </div>

            {camposPersonalizados.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {camposPersonalizados.map((campo) => (
                  <div
                    key={campo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: THEME_TOKENS.colors.surfaceBase,
                      padding: '0.3rem 0.5rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: THEME_TOKENS.colors.textPrimary }}>{campo.etiqueta}:</strong>{' '}
                      <span style={{ color: THEME_TOKENS.colors.textSecondary }}>{campo.valor}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEliminarCampoPersonalizado(campo.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: THEME_TOKENS.colors.stateError,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                      title="Eliminar campo"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input
                type="text"
                placeholder="Campo (ej. Delito)"
                value={nuevaEtiqueta}
                onChange={(e) => setNuevaEtiqueta(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Valor (ej. Fraude específico)"
                value={nuevoValor}
                onChange={(e) => setNuevoValor(e.target.value)}
                style={{
                  flex: 1.2,
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleAgregarCampoPersonalizado}
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceDark,
                  color: '#fff',
                  border: 'none',
                  borderRadius: THEME_TOKENS.radii.xs,
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                + Añadir
              </button>
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={alCerrar}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                color: THEME_TOKENS.colors.textPrimary,
                padding: '0.45rem 0.85rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceDark,
                color: THEME_TOKENS.colors.textOnDark,
                border: 'none',
                padding: '0.45rem 1.15rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {grupoParaEditar ? 'Guardar Cambios del Caso' : 'Crear Caso / Expediente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
