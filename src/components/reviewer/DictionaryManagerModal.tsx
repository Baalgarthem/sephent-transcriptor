import React, { useState, useEffect } from 'react';
import { DictionaryEntry, TermCategory } from '../../services/reviewer/types';
import { DictionaryService } from '../../services/reviewer/dictionary/dictionaryService';
import { CustomDictionaryService } from '../../services/reviewer/dictionary/customDictionaryService';
import { THEME_TOKENS } from '../../config/themeTokens';

interface DictionaryManagerModalProps {
  abierto: boolean;
  alCerrar: () => void;
  alActualizarDiccionario?: () => void;
}

export const DictionaryManagerModal: React.FC<DictionaryManagerModalProps> = ({
  abierto,
  alCerrar,
  alActualizarDiccionario,
}) => {
  const [terminos, setTerminos] = useState<DictionaryEntry[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');

  // Campos del formulario para agregar término
  const [nuevoTermino, setNuevoTermino] = useState('');
  const [nuevaCategoria, setNuevaCategoria] = useState<TermCategory>('personalizado');
  const [nuevaExpansion, setNuevaExpansion] = useState('');
  const [nuevosErrores, setNuevosErrores] = useState('');
  const [nuevoContexto, setNuevoContexto] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const cargarTerminos = () => {
    setTerminos(DictionaryService.obtenerCatalogoCompleto());
  };

  useEffect(() => {
    if (abierto) {
      cargarTerminos();
    }
  }, [abierto]);

  if (!abierto) return null;

  const handleAgregarTermino = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTermino.trim()) return;

    const misrecs = nuevosErrores
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const ctx = nuevoContexto
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    CustomDictionaryService.agregarTermino({
      term: nuevoTermino.trim(),
      category: nuevaCategoria,
      acronymExpanded: nuevaExpansion.trim() || undefined,
      frequentMisrecognitions: misrecs,
      contextKeywords: ctx,
    });

    setNuevoTermino('');
    setNuevaExpansion('');
    setNuevosErrores('');
    setNuevoContexto('');
    setMostrarFormulario(false);
    cargarTerminos();

    if (alActualizarDiccionario) {
      alActualizarDiccionario();
    }
  };

  const handleEliminarTermino = (id: string) => {
    if (confirm('¿Desea eliminar este término personalizado?')) {
      CustomDictionaryService.eliminarTermino(id);
      cargarTerminos();
      if (alActualizarDiccionario) {
        alActualizarDiccionario();
      }
    }
  };

  const terminosFiltrados = terminos.filter((t) => {
    const coincideCat = filtroCategoria === 'todos' || t.category === filtroCategoria;
    const coincideTxt =
      t.term.toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.acronymExpanded && t.acronymExpanded.toLowerCase().includes(busqueda.toLowerCase())) ||
      t.frequentMisrecognitions.some((m) => m.toLowerCase().includes(busqueda.toLowerCase()));
    return coincideCat && coincideTxt;
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          borderRadius: THEME_TOKENS.radii.md,
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: THEME_TOKENS.shadows.lg,
          overflow: 'hidden',
        }}
      >
        {/* Cabecera Modal */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            color: THEME_TOKENS.colors.textOnDark,
            padding: '1rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: THEME_TOKENS.fonts.serif }}>
              📖 Diccionario Especializado y Extensible
            </h3>
            <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textOnDarkMuted }}>
              Base canónica pericial y términos personalizados por proyecto
            </span>
          </div>
          <button
            onClick={alCerrar}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Barra de Filtro y Acción */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: THEME_TOKENS.colors.bgCanvas,
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
            <input
              type="text"
              placeholder="Buscar término, sigla o variante..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.8125rem',
                minWidth: '220px',
                outline: 'none',
              }}
            />
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.8125rem',
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                outline: 'none',
              }}
            >
              <option value="todos">Todas las categorías ({terminos.length})</option>
              <option value="siglas">Siglas e Instituciones</option>
              <option value="juridico">Jurídico / Pericial</option>
              <option value="medico">Médico / Forense</option>
              <option value="tecnico">Técnico e IT</option>
              <option value="ingles">Inglés Frecuente</option>
              <option value="personalizado">Personalizados por Usuario</option>
            </select>
          </div>

          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              color: THEME_TOKENS.colors.textOnDark,
              border: 'none',
              padding: '0.45rem 0.9rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {mostrarFormulario ? '✕ Cerrar Formulario' : '＋ Agregar Término'}
          </button>
        </div>

        {/* Formulario de Alta de Nuevo Término */}
        {mostrarFormulario && (
          <form
            onSubmit={handleAgregarTermino}
            style={{
              padding: '1rem 1.25rem',
              backgroundColor: '#F8F6F2',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            }}
          >
            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.875rem', color: THEME_TOKENS.colors.textPrimary }}>
              Añadir Nuevo Término o Sigla Personalizada
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>
                  Término o Sigla Canónica *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: COFECE, Fideicomiso, etc."
                  value={nuevoTermino}
                  onChange={(e) => setNuevoTermino(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', border: '1px solid #CCC', borderRadius: '3px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>
                  Categoría
                </label>
                <select
                  value={nuevaCategoria}
                  onChange={(e) => setNuevaCategoria(e.target.value as TermCategory)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', border: '1px solid #CCC', borderRadius: '3px', backgroundColor: '#fff' }}
                >
                  <option value="personalizado">Personalizado</option>
                  <option value="siglas">Sigla o Institución</option>
                  <option value="juridico">Jurídico</option>
                  <option value="medico">Médico</option>
                  <option value="tecnico">Técnico</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>
                  Significado / Expansión (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Comisión Federal de Competencia"
                  value={nuevaExpansion}
                  onChange={(e) => setNuevaExpansion(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', border: '1px solid #CCC', borderRadius: '3px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>
                  Errores de audio frecuentes (separados por comas)
                </label>
                <input
                  type="text"
                  placeholder="Ej: cofese, cofece, co fe ce"
                  value={nuevosErrores}
                  onChange={(e) => setNuevosErrores(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', border: '1px solid #CCC', borderRadius: '3px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>
                  Palabras de contexto temático (separadas por comas)
                </label>
                <input
                  type="text"
                  placeholder="Ej: competencia, mercado, monopolio"
                  value={nuevoContexto}
                  onChange={(e) => setNuevoContexto(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', border: '1px solid #CCC', borderRadius: '3px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setMostrarFormulario(false)}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: '1px solid #CCC', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '0.35rem 1rem', fontSize: '0.75rem', backgroundColor: THEME_TOKENS.colors.surfaceDark, color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 600 }}
              >
                Guardar en Diccionario
              </button>
            </div>
          </form>
        )}

        {/* Lista de Términos con Scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {terminosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: THEME_TOKENS.colors.textSecondary }}>
              No se encontraron términos que coincidan con los criterios de búsqueda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {terminosFiltrados.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderRadius: THEME_TOKENS.radii.xs,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary }}>
                        {t.term}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '2px',
                          backgroundColor: THEME_TOKENS.colors.bgSecondary,
                          color: THEME_TOKENS.colors.textSecondary,
                          border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {t.category}
                      </span>
                      {t.source === 'custom' && (
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: '#2E7D32', padding: '0.1rem 0.35rem', borderRadius: '2px' }}>
                          Personalizado
                        </span>
                      )}
                    </div>

                    {t.acronymExpanded && (
                      <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                        {t.acronymExpanded}
                      </span>
                    )}

                    {t.frequentMisrecognitions.length > 0 && (
                      <span style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textMuted }}>
                        Variantes contempladas: {t.frequentMisrecognitions.join(', ')}
                      </span>
                    )}
                  </div>

                  {t.source === 'custom' && (
                    <button
                      onClick={() => handleEliminarTermino(t.id)}
                      style={{
                        backgroundColor: '#FFEBEE',
                        color: '#C62828',
                        border: '1px solid #FFCDD2',
                        borderRadius: THEME_TOKENS.radii.xs,
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                      title="Eliminar término personalizado"
                    >
                      🗑️ Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie Modal */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: THEME_TOKENS.colors.bgCanvas,
            borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
            Total de términos activos en el motor pericial: {terminos.length}
          </span>
          <button
            onClick={alCerrar}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              color: THEME_TOKENS.colors.textOnDark,
              border: 'none',
              padding: '0.45rem 1.25rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
