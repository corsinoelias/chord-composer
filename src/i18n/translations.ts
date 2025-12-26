export type Language = 'es' | 'en';

export const translations = {
  es: {
    // Header
    appTitle: 'Chord Player',
    appSubtitle: 'Crea progresiones de acordes y exporta',
    
    // Transport Controls
    songTitle: 'Título de la canción',
    tempo: 'Tempo',
    transpose: 'Transponer',
    metronome: 'Metrónomo',
    export: 'Exportar',
    exporting: 'Exportando...',
    
    // Rhythm & Style
    instruments: 'Instrumentos',
    editRhythm: 'Editar Ritmo',
    newRhythm: 'Nuevo Ritmo',
    myRhythms: 'Mis Ritmos',
    
    // Section Card
    chords: 'acordes',
    chord: 'acorde',
    addChord: 'Añadir Acorde',
    loopSection: 'Repetir esta sección',
    duplicateSection: 'Duplicar sección',
    deleteSection: 'Eliminar sección',
    noChords: 'Sin acordes. Haz clic en + para añadir.',
    dropChordHere: 'Suelta el acorde aquí',
    
    // General
    addSection: 'Añadir Sección',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    reset: 'Reiniciar',
    close: 'Cerrar',
    copy: 'Copiar',
    
    // Rhythm Editor
    rhythmEditor: 'Editor de Ritmo',
    name: 'Nombre',
    category: 'Categoría',
    play: 'Reproducir',
    stop: 'Detener',
    previewFill: 'Previsualizar Fill',
    main: 'Principal',
    fill: 'Fill',
    fillPosition: 'Posición del Fill',
    beat: 'Tiempo',
    copyMain: 'Copiar Principal',
    volumes: 'Volúmenes',
    drums: 'Batería',
    bass: 'Bajo',
    piano: 'Piano',
    addInstrument: 'Añadir',
    clearPattern: 'Limpiar patrón',
    removeInstrument: 'Quitar instrumento',
    bassSustain: 'Bajo Sostenido',
    clickCycle: 'Clic: ciclar | Clic derecho: limpiar',
    velocity: 'Vel',
    
    // Dialogs
    deleteRhythm: 'Eliminar Ritmo',
    deleteRhythmConfirm: '¿Estás seguro de que quieres eliminar "{name}"? Esta acción no se puede deshacer.',
    saveChanges: 'Guardar Cambios',
    saveChangesBuiltIn: 'Estás editando un ritmo predeterminado. ¿Cómo deseas guardar tus cambios?',
    saveAsNew: 'Guardar como Nuevo',
    saveOverride: 'Guardar como Modificación',
    unsavedChanges: 'Cambios sin Guardar',
    discardChangesConfirm: '¿Estás seguro de que quieres cerrar y descartar los cambios?',
    keepEditing: 'Seguir Editando',
    discardChanges: 'Descartar Cambios',
    resetChanges: 'Reiniciar Cambios',
    resetChangesConfirm: 'Los cambios se reiniciarán a los valores de la última vez que se guardó. ¿Continuar?',
    
    // Status
    live: 'EN VIVO',
    synced: 'SINCRONIZADO',
    fillPreview: 'PREVISUALIZACIÓN FILL',
    previewing: 'Previsualizando...',
    
    // Toasts
    cannotRemoveCoreInstruments: 'No se pueden eliminar los instrumentos principales',
    patternCopiedToFill: 'Patrón copiado al fill',
    savedChangesTo: 'Guardados los cambios en "{name}"',
    createdNewRhythm: 'Ritmo "{name}" creado',
    rhythmDeleted: 'Ritmo "{name}" eliminado',
    resetToOriginal: 'Reiniciado al ritmo original',
    cannotDeleteLastChord: 'No se puede eliminar el último acorde',
    cannotDeleteOnlySection: 'No se puede eliminar la única sección',
    chordAddedTo: '{chord} añadido a {section}',
    renderingAudio: 'Renderizando audio...',
    exportSuccess: '¡WAV exportado con éxito!',
    exportFailed: 'Error al exportar. Intenta de nuevo.',
    
    // Chord Edit Modal
    editChord: 'Editar Acorde',
    rootNote: 'Nota raíz',
    accidental: 'Alteración',
    quality: 'Cualidad',
    duration: 'Duración',
    beats: 'tiempos',
    
    // Add Chord Modal
    addChordTo: 'Añadir acorde a {section}',
    
    // Create Rhythm Modal
    createNewRhythm: 'Crear Nuevo Ritmo',
    rhythmName: 'Nombre del Ritmo',
    basedOn: 'Basado en',
    createRhythm: 'Crear Ritmo',
    
    // Language
    language: 'Idioma',
    spanish: 'Español',
    english: 'English',
  },
  en: {
    // Header
    appTitle: 'Chord Player',
    appSubtitle: 'Create chord progressions & export',
    
    // Transport Controls
    songTitle: 'Song Title',
    tempo: 'Tempo',
    transpose: 'Transpose',
    metronome: 'Metronome',
    export: 'Export',
    exporting: 'Exporting...',
    
    // Rhythm & Style
    instruments: 'Instruments',
    editRhythm: 'Edit Rhythm',
    newRhythm: 'New Rhythm',
    myRhythms: 'My Rhythms',
    
    // Section Card
    chords: 'chords',
    chord: 'chord',
    addChord: 'Add Chord',
    loopSection: 'Loop this section',
    duplicateSection: 'Duplicate section',
    deleteSection: 'Delete section',
    noChords: 'No chords yet. Click + to add.',
    dropChordHere: 'Drop chord here',
    
    // General
    addSection: 'Add Section',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    reset: 'Reset',
    close: 'Close',
    copy: 'Copy',
    
    // Rhythm Editor
    rhythmEditor: 'Rhythm Editor',
    name: 'Name',
    category: 'Category',
    play: 'Play',
    stop: 'Stop',
    previewFill: 'Preview Fill',
    main: 'Main',
    fill: 'Fill',
    fillPosition: 'Fill Position',
    beat: 'Beat',
    copyMain: 'Copy Main',
    volumes: 'Volumes',
    drums: 'Drums',
    bass: 'Bass',
    piano: 'Piano',
    addInstrument: 'Add',
    clearPattern: 'Clear pattern',
    removeInstrument: 'Remove instrument',
    bassSustain: 'Bass Sustain',
    clickCycle: 'Click: cycle | Right-click: clear',
    velocity: 'Vel',
    
    // Dialogs
    deleteRhythm: 'Delete Rhythm',
    deleteRhythmConfirm: 'Are you sure you want to delete "{name}"? This action cannot be undone.',
    saveChanges: 'Save Changes',
    saveChangesBuiltIn: "You're editing a built-in rhythm. How would you like to save your changes?",
    saveAsNew: 'Save as New',
    saveOverride: 'Save Override',
    unsavedChanges: 'Unsaved Changes',
    discardChangesConfirm: 'Are you sure you want to close and discard your changes?',
    keepEditing: 'Keep Editing',
    discardChanges: 'Discard Changes',
    resetChanges: 'Reset Changes',
    resetChangesConfirm: 'Changes will be reset to the last saved values. Continue?',
    
    // Status
    live: 'LIVE',
    synced: 'SYNCED',
    fillPreview: 'FILL PREVIEW',
    previewing: 'Previewing...',
    
    // Toasts
    cannotRemoveCoreInstruments: 'Cannot remove core instruments',
    patternCopiedToFill: 'Pattern copied to fill',
    savedChangesTo: 'Saved changes to "{name}"',
    createdNewRhythm: 'Rhythm "{name}" created',
    rhythmDeleted: 'Rhythm "{name}" deleted',
    resetToOriginal: 'Reset to original rhythm',
    cannotDeleteLastChord: 'Cannot delete the last chord',
    cannotDeleteOnlySection: 'Cannot delete the only section',
    chordAddedTo: 'Added {chord} to {section}',
    renderingAudio: 'Rendering audio...',
    exportSuccess: 'WAV exported successfully!',
    exportFailed: 'Export failed. Please try again.',
    
    // Chord Edit Modal
    editChord: 'Edit Chord',
    rootNote: 'Root Note',
    accidental: 'Accidental',
    quality: 'Quality',
    duration: 'Duration',
    beats: 'beats',
    
    // Add Chord Modal
    addChordTo: 'Add chord to {section}',
    
    // Create Rhythm Modal
    createNewRhythm: 'Create New Rhythm',
    rhythmName: 'Rhythm Name',
    basedOn: 'Based on',
    createRhythm: 'Create Rhythm',
    
    // Language
    language: 'Language',
    spanish: 'Español',
    english: 'English',
  }
} as const;

export type TranslationKey = keyof typeof translations.es;
