//go:build linux

package main

/*
#cgo linux pkg-config: gtk+-3.0
#cgo !webkit2_41 pkg-config: webkit2gtk-4.0
#cgo webkit2_41 pkg-config: webkit2gtk-4.1

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>

// tmiixDecidePolicy vetoes webview navigations to file:// URIs. WebKitGTK's
// default action for an OS file drop is to navigate to the dropped file,
// replacing the app UI (wails issue #3686); DOM preventDefault does not stop
// it, so we refuse the navigation at the policy level instead. All other
// navigations (wails asset scheme, dev server) proceed as usual.
static gboolean tmiixDecidePolicy(WebKitWebView *webview, WebKitPolicyDecision *decision, WebKitPolicyDecisionType type, gpointer data)
{
	if (type != WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
		return FALSE;
	}
	WebKitNavigationPolicyDecision *nav = WEBKIT_NAVIGATION_POLICY_DECISION(decision);
	WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(nav);
	WebKitURIRequest *request = webkit_navigation_action_get_request(action);
	const gchar *uri = webkit_uri_request_get_uri(request);
	if (uri != NULL && strncmp(uri, "file://", 7) == 0) {
		webkit_policy_decision_ignore(decision);
		return TRUE;
	}
	return FALSE;
}

static GtkWidget* tmiixFindWebView(GtkWidget *widget)
{
	if (WEBKIT_IS_WEB_VIEW(widget)) {
		return widget;
	}
	if (GTK_IS_CONTAINER(widget)) {
		GtkWidget *found = NULL;
		GList *children = gtk_container_get_children(GTK_CONTAINER(widget));
		for (GList *l = children; l != NULL && found == NULL; l = l->next) {
			found = tmiixFindWebView(GTK_WIDGET(l->data));
		}
		g_list_free(children);
		return found;
	}
	return NULL;
}

static gboolean tmiixInstallNavigationGuard(gpointer data)
{
	GList *tops = gtk_window_list_toplevels();
	for (GList *l = tops; l != NULL; l = l->next) {
		GtkWidget *webview = tmiixFindWebView(GTK_WIDGET(l->data));
		if (webview != NULL) {
			g_signal_connect(G_OBJECT(webview), "decide-policy", G_CALLBACK(tmiixDecidePolicy), NULL);
		}
	}
	g_list_free(tops);
	return G_SOURCE_REMOVE;
}

// tmiixScheduleNavigationGuard runs the installer on the GTK main loop, since
// it may be called from a non-GTK goroutine. g_idle_add is thread-safe.
static void tmiixScheduleNavigationGuard(void)
{
	g_idle_add(tmiixInstallNavigationGuard, NULL);
}
*/
import "C"

// installNavigationGuard stops the webview from navigating away from the app
// when a file is dropped onto it. Wails doesn't expose the webview, so we
// locate it via the GTK toplevel list on the main loop.
func installNavigationGuard() {
	C.tmiixScheduleNavigationGuard()
}
