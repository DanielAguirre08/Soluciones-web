"""
LABORATORIO S11 - Parte 2 (Extension a 3D)
Transformaciones interactivas 3D con OpenGL.

Replica las funcionalidades de la Parte 1 en una escena 3D:
  - Coordenadas 3D (X, Y, Z).
  - Proyeccion en perspectiva.
  - Transformaciones 3D (traslacion, rotacion en multiples ejes, escala).
  - Al menos dos figuras 3D: Cubo y Piramide.
  - Reinicio, selector de color (uniform), visualizacion de estado,
    limites, guardar/cargar JSON y rotacion automatica.

Requisitos: pip install -r requirements.txt
Ejecutar:   python trans_geo_3d.py
"""

import json
import os

import glfw
import numpy as np
from OpenGL.GL import (
    glClear, glClearColor, glUseProgram, glGetUniformLocation,
    glUniformMatrix4fv, glUniform3f, glBindVertexArray, glDrawArrays,
    glGenVertexArrays, glGenBuffers, glBindBuffer, glBufferData,
    glVertexAttribPointer, glEnableVertexAttribArray, glViewport,
    glEnable, glDepthFunc,
    GL_COLOR_BUFFER_BIT, GL_DEPTH_BUFFER_BIT, GL_TRUE, GL_TRIANGLES,
    GL_ARRAY_BUFFER, GL_STATIC_DRAW, GL_FLOAT, GL_FALSE, GL_DEPTH_TEST,
    GL_LESS,
)

import imgui
from imgui.integrations.glfw import GlfwRenderer

import glkit

WIDTH, HEIGHT = 1000, 720
STATE_FILE = "estado_3d.json"

FIGURES = ["Cubo", "Piramide"]
COLOR_NAMES = ["Rojo", "Verde", "Azul"]
COLOR_RGB = [(1.0, 0.0, 0.0), (0.0, 0.8, 0.0), (0.0, 0.35, 1.0)]

T_LIMIT = 2.0
SCALE_MIN, SCALE_MAX = 0.20, 2.50

DEFAULTS = {
    "figure": 0,
    "color": 0,
    "tx": 0.0, "ty": 0.0, "tz": 0.0,
    "rx": 25.0, "ry": -30.0, "rz": 0.0,
    "scale": 1.0,
    "auto_rotate": False,
}

VERTEX_SHADER = """
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
void main() {
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
    // normal en espacio de mundo (modelo sin escala no uniforme extrema)
    vNormal = mat3(uModel) * aNormal;
}
"""

FRAGMENT_SHADER = """
#version 330 core
in vec3 vNormal;
out vec4 FragColor;
uniform vec3 uColor;   // color dinamico via uniform
void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.5, 0.8, 0.6));
    float diff = max(dot(N, L), 0.0);
    float ambient = 0.35;
    vec3 color = uColor * (ambient + 0.75 * diff);
    FragColor = vec4(color, 1.0);
}
"""


# ---------------------------------------------------------------------------
# Geometria 3D (posicion + normal por vertice)
# ---------------------------------------------------------------------------
def _cube():
    # 6 caras, 2 triangulos cada una. Cada cara con su normal.
    faces = [
        # (cuatro esquinas en orden, normal)
        ([(-0.5, -0.5,  0.5), (0.5, -0.5,  0.5), (0.5,  0.5,  0.5), (-0.5,  0.5,  0.5)], (0, 0, 1)),   # frente
        ([(0.5, -0.5, -0.5), (-0.5, -0.5, -0.5), (-0.5,  0.5, -0.5), (0.5,  0.5, -0.5)], (0, 0, -1)),  # atras
        ([(-0.5, -0.5, -0.5), (-0.5, -0.5,  0.5), (-0.5,  0.5,  0.5), (-0.5,  0.5, -0.5)], (-1, 0, 0)), # izq
        ([(0.5, -0.5,  0.5), (0.5, -0.5, -0.5), (0.5,  0.5, -0.5), (0.5,  0.5,  0.5)], (1, 0, 0)),      # der
        ([(-0.5,  0.5,  0.5), (0.5,  0.5,  0.5), (0.5,  0.5, -0.5), (-0.5,  0.5, -0.5)], (0, 1, 0)),    # arriba
        ([(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5,  0.5), (-0.5, -0.5,  0.5)], (0, -1, 0)),   # abajo
    ]
    data = []
    for quad, n in faces:
        a, b, c, d = quad
        for v in (a, b, c, a, c, d):
            data.extend(v)
            data.extend(n)
    return np.array(data, dtype=np.float32)


def _pyramid():
    apex = (0.0, 0.6, 0.0)
    bl = (-0.5, -0.4, -0.5)
    br = (0.5, -0.4, -0.5)
    fr = (0.5, -0.4, 0.5)
    fl = (-0.5, -0.4, 0.5)

    def normal(p1, p2, p3):
        u = np.subtract(p2, p1)
        v = np.subtract(p3, p1)
        n = np.cross(u, v)
        norm = np.linalg.norm(n)
        return (n / norm) if norm else n

    tris = [
        (fl, fr, apex),   # frente
        (fr, br, apex),   # derecha
        (br, bl, apex),   # atras
        (bl, fl, apex),   # izquierda
        # base (dos triangulos), normal hacia abajo
        (bl, br, fr),
        (bl, fr, fl),
    ]
    data = []
    for p1, p2, p3 in tris:
        n = normal(p1, p2, p3)
        for v in (p1, p2, p3):
            data.extend(v)
            data.extend(n)
    return np.array(data, dtype=np.float32)


def build_figures():
    figures = []
    for verts in (_cube(), _pyramid()):
        vao = glGenVertexArrays(1)
        vbo = glGenBuffers(1)
        glBindVertexArray(vao)
        glBindBuffer(GL_ARRAY_BUFFER, vbo)
        glBufferData(GL_ARRAY_BUFFER, verts.nbytes, verts, GL_STATIC_DRAW)
        stride = 6 * 4
        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, stride, None)
        glEnableVertexAttribArray(0)
        from ctypes import c_void_p
        glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, stride, c_void_p(3 * 4))
        glEnableVertexAttribArray(1)
        figures.append((vao, len(verts) // 6))
    glBindVertexArray(0)
    return figures


# ---------------------------------------------------------------------------
# Estado / persistencia
# ---------------------------------------------------------------------------
def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def apply_limits(state):
    state["scale"] = clamp(state["scale"], SCALE_MIN, SCALE_MAX)
    for k in ("tx", "ty", "tz"):
        state[k] = clamp(state[k], -T_LIMIT, T_LIMIT)
    for k in ("rx", "ry", "rz"):
        state[k] = ((state[k] + 180.0) % 360.0) - 180.0
    return state


def save_state(state, path=STATE_FILE):
    data = {
        "figure": FIGURES[state["figure"]],
        "color": COLOR_NAMES[state["color"]],
        "tx": round(state["tx"], 4), "ty": round(state["ty"], 4), "tz": round(state["tz"], 4),
        "rx": round(state["rx"], 2), "ry": round(state["ry"], 2), "rz": round(state["rz"], 2),
        "scale": round(state["scale"], 4),
        "auto_rotate": state["auto_rotate"],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return os.path.abspath(path)


def load_state(state, path=STATE_FILE):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("figure") in FIGURES:
        state["figure"] = FIGURES.index(data["figure"])
    if data.get("color") in COLOR_NAMES:
        state["color"] = COLOR_NAMES.index(data["color"])
    for k in ("tx", "ty", "tz", "rx", "ry", "rz", "scale"):
        if k in data:
            state[k] = float(data[k])
    state["auto_rotate"] = bool(data.get("auto_rotate", False))
    apply_limits(state)
    return True


# ---------------------------------------------------------------------------
def main():
    if not glfw.init():
        raise RuntimeError("No se pudo inicializar GLFW")

    glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
    glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
    glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
    glfw.window_hint(glfw.OPENGL_FORWARD_COMPAT, GL_TRUE)

    window = glfw.create_window(WIDTH, HEIGHT, "Lab S11 - Parte 2 (3D)", None, None)
    if not window:
        glfw.terminate()
        raise RuntimeError("No se pudo crear la ventana")

    glfw.make_context_current(window)
    glfw.swap_interval(1)

    imgui.create_context()
    impl = GlfwRenderer(window)

    program = glkit.create_program(VERTEX_SHADER, FRAGMENT_SHADER)
    loc_proj = glGetUniformLocation(program, "uProj")
    loc_view = glGetUniformLocation(program, "uView")
    loc_model = glGetUniformLocation(program, "uModel")
    loc_color = glGetUniformLocation(program, "uColor")

    figures = build_figures()
    state = dict(DEFAULTS)
    status_msg = ""

    glEnable(GL_DEPTH_TEST)
    glDepthFunc(GL_LESS)

    view = glkit.look_at(eye=[0.0, 0.0, 5.0], center=[0.0, 0.0, 0.0], up=[0.0, 1.0, 0.0])

    last_time = glfw.get_time()

    while not glfw.window_should_close(window):
        now = glfw.get_time()
        dt = now - last_time
        last_time = now

        glfw.poll_events()
        impl.process_inputs()

        if state["auto_rotate"]:
            state["ry"] += 50.0 * dt

        # --- UI ---
        imgui.new_frame()
        imgui.begin("Controles 3D", True)

        _, state["figure"] = imgui.combo("Figura", state["figure"], FIGURES)
        _, state["color"] = imgui.combo("Color", state["color"], COLOR_NAMES)

        imgui.separator()
        imgui.text("Traslacion")
        _, state["tx"] = imgui.slider_float("X", state["tx"], -T_LIMIT, T_LIMIT)
        _, state["ty"] = imgui.slider_float("Y", state["ty"], -T_LIMIT, T_LIMIT)
        _, state["tz"] = imgui.slider_float("Z", state["tz"], -T_LIMIT, T_LIMIT)

        imgui.text("Rotacion (grados)")
        _, state["rx"] = imgui.slider_float("Rot X", state["rx"], -180.0, 180.0)
        _, state["ry"] = imgui.slider_float("Rot Y", state["ry"], -180.0, 180.0)
        _, state["rz"] = imgui.slider_float("Rot Z", state["rz"], -180.0, 180.0)

        _, state["scale"] = imgui.slider_float("Escala", state["scale"], SCALE_MIN, SCALE_MAX)
        _, state["auto_rotate"] = imgui.checkbox("Rotacion automatica", state["auto_rotate"])

        imgui.separator()
        if imgui.button("Reiniciar"):
            state.update(DEFAULTS)
            status_msg = "Transformaciones reiniciadas"
        imgui.same_line()
        if imgui.button("Guardar JSON"):
            status_msg = f"Guardado en {save_state(state)}"
        imgui.same_line()
        if imgui.button("Cargar JSON"):
            status_msg = (f"Cargado desde {os.path.abspath(STATE_FILE)}"
                          if load_state(state) else f"No existe {STATE_FILE}")

        imgui.separator()
        imgui.text("== Estado actual ==")
        imgui.text(f"Figura     : {FIGURES[state['figure']]}")
        imgui.text(f"Color      : {COLOR_NAMES[state['color']]}")
        imgui.text(f"Traslacion : X={state['tx']:.2f} Y={state['ty']:.2f} Z={state['tz']:.2f}")
        imgui.text(f"Rotacion   : X={state['rx']:.1f} Y={state['ry']:.1f} Z={state['rz']:.1f}")
        imgui.text(f"Escala     : {state['scale']:.3f}")
        if status_msg:
            imgui.separator()
            imgui.text_wrapped(status_msg)
        imgui.end()

        apply_limits(state)

        # --- Render ---
        fb_w, fb_h = glfw.get_framebuffer_size(window)
        glViewport(0, 0, fb_w, fb_h)
        glClearColor(0.07, 0.07, 0.09, 1.0)
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

        aspect = fb_w / float(fb_h) if fb_h else 1.0
        proj = glkit.perspective(45.0, aspect, 0.1, 100.0)

        model = (
            glkit.translate(state["tx"], state["ty"], state["tz"])
            @ glkit.rotate_z(state["rz"])
            @ glkit.rotate_y(state["ry"])
            @ glkit.rotate_x(state["rx"])
            @ glkit.scale(state["scale"], state["scale"], state["scale"])
        )

        glUseProgram(program)
        glUniformMatrix4fv(loc_proj, 1, GL_TRUE, proj)
        glUniformMatrix4fv(loc_view, 1, GL_TRUE, view)
        glUniformMatrix4fv(loc_model, 1, GL_TRUE, model)
        r, g, b = COLOR_RGB[state["color"]]
        glUniform3f(loc_color, r, g, b)

        vao, count = figures[state["figure"]]
        glBindVertexArray(vao)
        glDrawArrays(GL_TRIANGLES, 0, count)
        glBindVertexArray(0)

        imgui.render()
        impl.render(imgui.get_draw_data())
        glfw.swap_buffers(window)

    impl.shutdown()
    glfw.terminate()


if __name__ == "__main__":
    main()
