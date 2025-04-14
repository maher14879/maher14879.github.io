class Note():
    def __init__(self, frequency, volume):
        self.frequency = frequency
        self.volume = volume

    def play(self):
        pass  # Placeholder for actual sound playing logic

class Notes():
    def __init__(self, notes: list[Note|None]):
        self.notes = notes
        self.index = 0
    
    def deque(self):
        if self.index >= len(self.notes):
            note = self.notes[self.index]
            self.index += 1
            return note

class Channel():
    def __init__(self, channel_num: int, notes: Notes, note_duration: int):
        self.channel_num = channel_num
        self.notes = notes
        self.note_duration = note_duration
        self.current_note = None
        self.time = 0
    
    def run(self, dt):
        self.time += dt
        if self.time > self.note_duration:
            self.time -= self.note_duration
            self.current_note = self.notes.deque()
            if self.current_note: self.current_note.play()

    def visualize(self):
        # Placeholder for visualization logic
        pass

class Synthesizer():
    #pseudoclass
    def __init__(self, midi_file, note_duration):
        self.quaver_length = midi_file.bar_length / 8
        self.notes_per_bar = {}
        for track in midi_file.tracks:
            for note in track.notes:
                self.append_note(note)
        
        self.notes_dict = {}
        channel_num_max = 0
        for bar in self.notes_per_bar:
            notes = self.notes_per_bar[bar]
            channel_num_max = max(len(notes), channel_num_max)
            for channel_num in enumerate(channel_num_max):
                note = notes[channel_num] if channel_num < len(notes) else None
                frequency = note.frequency
                volume = note.volume
                if channel_num not in self.notes_dict:
                    self.notes_dict[channel_num] = []
                self.notes_dict[channel_num].append(Note(frequency, volume))

        self.channels = []
        for channel_num in enumerate(channel_num_max):
            notes = self.notes_dict[channel_num]
            self.channels.append(Channel(channel_num, Notes(notes), note_duration))

        self.quaver_length = None
        self.notes_per_bar = None
        self.notes_dict = None

    def append_note(self, note):
        if note.duration > self.quaver_length:
            next_note = note.extend(self.quaver_length)
            self.append_note(next_note)

        bar = round_down(note.time / quaver_length)
        if bar not in self.notes:
            self.notes_per_bar[bar] = []
        self.notes_per_bar[bar].append(note)
    
    def run(self, dt):
        for channel in self.channels:
            channel.run(dt)