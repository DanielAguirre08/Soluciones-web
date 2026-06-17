"""
LABORATORIO S11 - Parte 1 (2D)
Transformaciones interactivas con OpenGL (equivalente a trans_geo_2d.html en WebGL).

Cumple los 8 requisitos:
  1. Reinicio de transformaciones (boton Reset + actualiza sliders).
  2. Cambio de color dinamico (selector rojo/verde/azul, uniform en fragment shader).
  3. Visualizacion de estado (traslacion X/Y, rotacion, escala en pantalla).
  4. Limites en las transformaciones (clamp para no salir del area visible).
  5. Multiples figuras (cuadrado, triangulo, rombo) seleccionables.
  6. Persistencia: guardar estado (transformaciones, color, figura) en JSON.
  7. Carga de configuracion desde un JSON guardado.
  8. Rotacion automatica (checkbox) usando animacion.

Requisitos: pip install -r requirements.txt
Ejecutar:   python trans_geo_2d.py
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
    glEnable, glBlendFunc,
    GL_COLOR_BUFFER_BIT, GL_TRUE, GL_TRIANGLES, GL_ARRAY_BUFFER,
    GL_STATIC_DRAW, GL_FLOAT, GL_FALSE, GL_BLEND, GL_SRC_ALPHA,
    GL_ONE_MINUS_SRC_ALPHA,
)

import imgui
from imgui.integrations.glfw import GlfwRenderer

import glkit

# ---------------------------------------------------------------------------
# Configuracion / estado por defecto
# ---------------------------------------------------------------------------
WIDTH, HEIGHT = 1000, 720
STATE_FILE = "estado_2d.json"

FIGURES = ["Cuadrado", "Triangulo", "Rombo"]
COLOR_NAMES = ["Rojo", "Verde", "Azul"]
COLOR_RGB = [(1.0, 0.0, 0.0), (0.0, 0.8, 0.0), (0.0, 0.35, 1.0)]

# Limites (requisito 4)
T_LIMIT = 0.85          # traslacion maxima en cada eje
SCALE_MIN, SCALE_MAX = 0.20, 2.00

DEFAULTS = {
    "figure": 0,
    "color": 0,
    "tx": 0.0,
    "ty": 0.0,
    "angle": 0.0,     # grados
    "scale": 1.0,
    "auto_rotate": False,
}

VERTEX_SHADER = """
#version 330 core
layout(location = 0) in vec2 aPos;
uniform mat4 uProj;
uniform mat4 uModel;
void main() {
    gl_Position = uProj * uModel * vec4(aPos, 0.0, 1.0);
}
"""

FRAGMENT_SHADER = """
#version 330 core
out vec4 FragColor;
uniform vec3 uColor;   // requisito 2: color dinamico via uniform
void main() {
    FragColor = vec4(uColor, 1.0);
}
"""


# ---------------------------------------------------------------------------
# Geometria de las figuras (figuras centradas en el origen, "medio lado" ~0.5)
# ---------------------------------------------------------------------------
def build_figures():
    square = np.array([
        -0.5, -0.5,  0.5, -0.5,  0.5,  0.5,
        -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,
    ], dtype=np.float32)

    triangle = np.array([
        0.0,  0.5,
        -0.5, -0.5,
        0.5, -0.5,
    ], dtype=np.float32)

    # Rombo (diamante): top, left, bottom, right
    rhombus = np.array([
        0.0,  0.6, -0.5,  0.0,  0.0, -0.6,   # mitad izquierda
        0.0,  0.6,  0.0, -0.6,  0.5,  0.0,   # mitad derecha
    ], dtype=np.float32)

    data = [square, triangle, rhombus]
    figures = []
    for verts in data:
        vao = glGenVertexArrays(1)
        vbo = glGenBuffers(1)
        glBindVertexArray(vao)
        glBindBuffer(GL_ARRAY_BUFFER, vbo)
        glBufferData(GL_ARRAY_BUFFER, verts.nbytes, verts, GL_STATIC_DRAW)
        glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2 * 4, None)
        glEnableVertexAttribArray(0)
        figures.append((vao, len(verts) // 2))
    glBindVertexArray(0)
    return figures


# ---------------------------------------------------------------------------
# Helpers de estado
# ---------------------------------------------------------------------------
def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def apply_limits(state):
    """Requisito 4: mantener la figura dentro del area visible."""
    state["scale"] = clamp(state["scale"], SCALE_MIN, SCALE_MAX)
    # margen dependiente de la escala para que la figura no se salga
    margin = T_LIMIT - 0.5 * state["scale"]
    margin = max(0.0, margin)
    state["tx"] = clamp(state["tx"], -margin, margin)
    state["ty"] = clamp(state["ty"], -margin, margin)
    # angulo normalizado a [-180, 180]
    state["angle"] = ((state["angle"] + 180.0) % 360.0) - 180.0
    return state


def save_state(state, path=STATE_FILE):
    data = {
        "figure": FIGURES[state["figure"]],
        "color": COLOR_NAMES[state["color"]],
        "tx": round(state["tx"], 4),
        "ty": round(state["ty"], 4),
        "angle": round(state["angle"], 2),
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
    for k in ("tx", "ty", "angle", "scale"):
        if k in data:
            state[k] = float(data[k])
    state["auto_rotate"] = bool(data.get("auto_rotate", False))
    apply_limits(state)
    return True


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------
def main():
    if not glfw.init():
        raise RuntimeError("No se pudo inicializar GLFW")

    # Core profile 3.3 (compatible con macOS)
    glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
    glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
    glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
    glfw.window_hint(glfw.OPENGL_FORWARD_COMPAT, GL_TRUE)

    window = glfw.create_window(WIDTH, HEIGHT, "Lab S11 - Parte 1 (2D)", None, None)
    if not window:
        glfw.terminate()
        raise RuntimeError("No se pudo crear la ventana")

    glfw.make_context_current(window)
    glfw.swap_interval(1)

    imgui.create_context()
    impl = GlfwRenderer(window)

    program = glkit.create_program(VERTEX_SHADER, FRAGMENT_SHADER)
    loc_proj = glGetUniformLocation(program, "uProj")
    loc_model = glGetUniformLocation(program, "uModel")
    loc_color = glGetUniformLocation(program, "uColor")

    figures = build_figures()
    state = dict(DEFAULTS)
    status_msg = ""

    glEnable(GL_BLEND)
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)

    last_time = glfw.get_time()

    while not glfw.window_should_close(window):
        now = glfw.get_time()
        dt = now - last_time
        last_time = now

        glfw.poll_events()
        impl.process_inputs()

        # Requisito 8: rotacion automatica
        if state["auto_rotate"]:
            state["angle"] += 60.0 * dt   # 60 grados por segundo

        # --- UI ---
        imgui.new_frame()
        imgui.begin("Controles", True)

        # Requisito 5: selector de figura
        changed, state["figure"] = imgui.combo("Figura", state["figure"], FIGURES)

        # Requisito 2: selector de color
        changed, state["color"] = imgui.combo("Color", state["color"], COLOR_NAMES)

        imgui.separator()

        # Sliders de transformacion (con limites del requisito 4)
        _, state["tx"] = imgui.slider_float("Translate X", state["tx"], -T_LIMIT, T_LIMIT)
        _, state["ty"] = imgui.slider_float("Translate Y", state["ty"], -T_LIMIT, T_LIMIT)
        _, state["angle"] = imgui.slider_float("Rotate (grados)", state["angle"], -180.0, 180.0)
        _, state["scale"] = imgui.slider_float("Scale", state["scale"], SCALE_MIN, SCALE_MAX)

        # Requisito 8: checkbox rotacion automatica
        _, state["auto_rotate"] = imgui.checkbox("Rotacion automatica", state["auto_rotate"])

        imgui.separator()

        # Requisito 1: reiniciar (los sliders se actualizan solos al cambiar el estado)
        if imgui.button("Reiniciar"):
            keep = state["auto_rotate"]
            state.update(DEFAULTS)
            state["auto_rotate"] = False
            status_msg = "Transformaciones reiniciadas"

        imgui.same_line()
        # Requisito 6: guardar JSON
        if imgui.button("Guardar JSON"):
            path = save_state(state)
            status_msg = f"Guardado en {path}"

        imgui.same_line()
        # Requisito 7: cargar JSON
        if imgui.button("Cargar JSON"):
            if load_state(state):
                status_msg = f"Cargado desde {os.path.abspath(STATE_FILE)}"
            else:
                status_msg = f"No existe {STATE_FILE}"

        imgui.separator()

        # Requisito 3: visualizacion de estado
        imgui.text("== Estado actual ==")
        imgui.text(f"Figura     : {FIGURES[state['figure']]}")
        imgui.text(f"Color      : {COLOR_NAMES[state['color']]}")
        imgui.text(f"Traslacion : X={state['tx']:.3f}  Y={state['ty']:.3f}")
        imgui.text(f"Rotacion   : {state['angle']:.1f} grados")
        imgui.text(f"Escala     : {state['scale']:.3f}")
        if status_msg:
            imgui.separator()
            imgui.text_wrapped(status_msg)

        imgui.end()

        # aplicar limites siempre (clamp tras edicion manual)
        apply_limits(state)

        # --- Render escena ---
        fb_w, fb_h = glfw.get_framebuffer_size(window)
        glViewport(0, 0, fb_w, fb_h)
        glClearColor(0.07, 0.07, 0.09, 1.0)
        glClear(GL_COLOR_BUFFER_BIT)

        aspect = fb_w / float(fb_h) if fb_h else 1.0
        # proyeccion ortografica que corrige el aspecto (mantiene cuadrado el cuadrado)
        proj = glkit.ortho(-aspect, aspect, -1.0, 1.0)

        model = (
            glkit.translate(state["tx"], state["ty"])
            @ glkit.rotate_z(state["angle"])
            @ glkit.scale(state["scale"])
        )

        glUseProgram(program)
        glUniformMatrix4fv(loc_proj, 1, GL_TRUE, proj)
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
